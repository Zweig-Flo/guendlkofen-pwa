import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOAuth2, ApiOkResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { MessageDto } from './dto/message.dto';
import type { User } from './generated/prisma/client';
import { UserDto } from './users/dto/user.dto';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  @ApiOkResponse({ type: MessageDto })
  getHello(): MessageDto {
    return { message: this.appService.getHello() };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOAuth2(['openid', 'profile', 'email'])
  @ApiOkResponse({ type: UserDto })
  getProfile(@Req() req: Request): UserDto {
    // request.user is the local Prisma User record (set by JwtStrategy.validate)
    return UserDto.fromUser(req.user as User);
  }
}
