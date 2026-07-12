import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';
import type { ChatMessageDto } from './dto/chat-message.dto';

export const roomForTeam = (teamId: string): string => `team:${teamId}`;

/** Payload broadcast when a message is deleted. */
export interface ChatMessageDeletedEvent {
  teamId: string;
  messageId: string;
}

/**
 * Decouples the REST side (ChatService) from the WebSocket gateway so they can
 * both reach the live layer without a circular import. The gateway registers
 * its socket.io `Server` here and keeps the presence map up to date; ChatService
 * only emits and queries presence.
 *
 * Presence is tracked in-memory (`teamId -> userId -> socketIds`), which is
 * correct for a single instance — matching the push-throttle assumption.
 */
@Injectable()
export class ChatEvents {
  private server: Server | null = null;

  // teamId -> userId -> set of that user's socket ids currently in the room
  private readonly byTeamUser = new Map<string, Map<string, Set<string>>>();
  // socketId -> which (teamId,userId) rooms it is part of, for disconnect cleanup
  private readonly bySocket = new Map<
    string,
    { userId: string; teamIds: Set<string> }
  >();

  setServer(server: Server): void {
    this.server = server;
  }

  registerJoin(teamId: string, userId: string, socketId: string): void {
    let users = this.byTeamUser.get(teamId);
    if (!users) {
      users = new Map();
      this.byTeamUser.set(teamId, users);
    }
    let sockets = users.get(userId);
    if (!sockets) {
      sockets = new Set();
      users.set(userId, sockets);
    }
    sockets.add(socketId);

    let meta = this.bySocket.get(socketId);
    if (!meta) {
      meta = { userId, teamIds: new Set() };
      this.bySocket.set(socketId, meta);
    }
    meta.teamIds.add(teamId);
  }

  registerLeave(teamId: string, userId: string, socketId: string): void {
    const users = this.byTeamUser.get(teamId);
    const sockets = users?.get(userId);
    sockets?.delete(socketId);
    if (sockets && sockets.size === 0) {
      users!.delete(userId);
    }
    if (users && users.size === 0) {
      this.byTeamUser.delete(teamId);
    }
    this.bySocket.get(socketId)?.teamIds.delete(teamId);
  }

  /** Removes a disconnected socket from every room it was in. */
  removeSocket(socketId: string): void {
    const meta = this.bySocket.get(socketId);
    if (!meta) {
      return;
    }
    for (const teamId of meta.teamIds) {
      const users = this.byTeamUser.get(teamId);
      const sockets = users?.get(meta.userId);
      sockets?.delete(socketId);
      if (sockets && sockets.size === 0) {
        users!.delete(meta.userId);
      }
      if (users && users.size === 0) {
        this.byTeamUser.delete(teamId);
      }
    }
    this.bySocket.delete(socketId);
  }

  /** True if the user has at least one live socket in the team's room. */
  isUserInRoom(teamId: string, userId: string): boolean {
    const sockets = this.byTeamUser.get(teamId)?.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }

  emitMessage(teamId: string, message: ChatMessageDto): void {
    this.server?.to(roomForTeam(teamId)).emit('chat:message', message);
  }

  emitDeleted(teamId: string, messageId: string): void {
    const payload: ChatMessageDeletedEvent = { teamId, messageId };
    this.server?.to(roomForTeam(teamId)).emit('chat:message:deleted', payload);
  }
}
