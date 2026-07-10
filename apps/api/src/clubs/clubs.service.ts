import { accessibleBy } from '@casl/prisma/runtime';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type Action, type AppAbility, toSubject } from '../casl/app-ability';
import type { Club } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateClubDto } from './dto/create-club.dto';
import type { UpdateClubDto } from './dto/update-club.dto';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Route policy already ensures only super admins get here. */
  create(dto: CreateClubDto): Promise<Club> {
    return this.prisma.club.create({ data: { name: dto.name } });
  }

  /** All clubs the caller may read — tenant isolation lives in the query. */
  findAllAccessible(ability: AppAbility): Promise<Club[]> {
    return this.prisma.club.findMany({
      where: accessibleBy(ability, 'read').ofType('Club'),
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Loads a club and asserts the ability may perform `action` on it.
   * 404 if the club does not exist, 403 if the ability forbids the action.
   * Also used by nested (team/membership) services to resolve the club scope.
   */
  async getClubForAbility(
    ability: AppAbility,
    clubId: string,
    action: Action,
  ): Promise<Club> {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    if (ability.cannot(action, toSubject('Club', club))) {
      throw new ForbiddenException('You have no access to this club');
    }
    return club;
  }

  async update(
    ability: AppAbility,
    clubId: string,
    dto: UpdateClubDto,
  ): Promise<Club> {
    await this.getClubForAbility(ability, clubId, 'update');
    return this.prisma.club.update({ where: { id: clubId }, data: dto });
  }

  async remove(ability: AppAbility, clubId: string): Promise<Club> {
    await this.getClubForAbility(ability, clubId, 'delete');
    return this.prisma.club.delete({ where: { id: clubId } });
  }
}
