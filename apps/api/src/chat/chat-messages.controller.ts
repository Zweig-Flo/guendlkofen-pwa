import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AppAbility } from '../casl/app-ability';
import { CurrentAbility } from '../casl/current-ability.decorator';
import { CurrentUser } from '../casl/current-user.decorator';
import { PoliciesGuard } from '../casl/policies.guard';
import type { User } from '../generated/prisma/client';
import { ChatService } from './chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';
import { ChatMessagePageDto } from './dto/chat-message-page.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@UseGuards(PoliciesGuard)
@Controller('clubs/:clubId/teams/:teamId/messages')
export class ChatMessagesController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  @ApiOkResponse({ type: ChatMessagePageDto })
  async list(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Query() query: ListMessagesQueryDto,
  ): Promise<ChatMessagePageDto> {
    return this.chatService.list(
      ability,
      clubId,
      teamId,
      query.cursor,
      query.limit,
    );
  }

  @Post()
  @ApiCreatedResponse({ type: ChatMessageDto })
  async send(
    @CurrentAbility() ability: AppAbility,
    @CurrentUser() user: User,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Body() dto: SendMessageDto,
  ): Promise<ChatMessageDto> {
    return this.chatService.send(ability, clubId, teamId, user, dto);
  }

  @Delete(':messageId')
  @HttpCode(204)
  @ApiNoContentResponse()
  async remove(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Param('teamId') teamId: string,
    @Param('messageId') messageId: string,
  ): Promise<void> {
    await this.chatService.remove(ability, clubId, teamId, messageId);
  }
}
