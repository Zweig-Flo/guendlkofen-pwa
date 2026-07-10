import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOAuth2,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AppAbility } from '../casl/app-ability';
import { CheckPolicies } from '../casl/check-policies.decorator';
import { CurrentAbility } from '../casl/current-ability.decorator';
import { PoliciesGuard } from '../casl/policies.guard';
import { ClubsService } from './clubs.service';
import { ClubDto } from './dto/club.dto';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';

@ApiTags('clubs')
@ApiBearerAuth()
@ApiOAuth2(['openid', 'profile', 'email'])
@UseGuards(PoliciesGuard)
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Post()
  @CheckPolicies((ability: AppAbility) => ability.can('create', 'Club'))
  @ApiCreatedResponse({ type: ClubDto })
  async create(@Body() dto: CreateClubDto): Promise<ClubDto> {
    return ClubDto.fromClub(await this.clubsService.create(dto));
  }

  @Get()
  @ApiOkResponse({ type: ClubDto, isArray: true })
  async findAll(@CurrentAbility() ability: AppAbility): Promise<ClubDto[]> {
    const clubs = await this.clubsService.findAllAccessible(ability);
    return clubs.map((club) => ClubDto.fromClub(club));
  }

  @Get(':clubId')
  @ApiOkResponse({ type: ClubDto })
  async findOne(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
  ): Promise<ClubDto> {
    return ClubDto.fromClub(
      await this.clubsService.getClubForAbility(ability, clubId, 'read'),
    );
  }

  @Patch(':clubId')
  @ApiOkResponse({ type: ClubDto })
  async update(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
    @Body() dto: UpdateClubDto,
  ): Promise<ClubDto> {
    return ClubDto.fromClub(
      await this.clubsService.update(ability, clubId, dto),
    );
  }

  @Delete(':clubId')
  @ApiOkResponse({ type: ClubDto })
  async remove(
    @CurrentAbility() ability: AppAbility,
    @Param('clubId') clubId: string,
  ): Promise<ClubDto> {
    return ClubDto.fromClub(await this.clubsService.remove(ability, clubId));
  }
}
