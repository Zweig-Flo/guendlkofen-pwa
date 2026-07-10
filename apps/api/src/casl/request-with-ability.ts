import type { Request } from 'express';
import type { User } from '../generated/prisma/client';
import type { AppAbility } from './app-ability';

/** Request shape after JwtAuthGuard (user) and PoliciesGuard (ability) ran. */
export interface RequestWithAbility extends Request {
  user: User;
  ability?: AppAbility;
}
