import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import type { Request } from 'express';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { MessageDto } from './dto/message.dto';
import { ProfileDto } from './dto/profile.dto';

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
  @ApiOkResponse({ type: ProfileDto })
  getProfile(@Req() req: Request): ProfileDto {
    const user = req.user as { sub: string };
    return { sub: user.sub };
  }
}
