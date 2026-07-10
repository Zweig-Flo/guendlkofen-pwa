import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '../generated/prisma/client';
import type { RequestWithAbility } from './request-with-ability';

/** Injects the local Prisma User record set by the JwtStrategy. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): User =>
    context.switchToHttp().getRequest<RequestWithAbility>().user,
);
