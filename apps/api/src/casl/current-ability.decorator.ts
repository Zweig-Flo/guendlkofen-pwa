import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AppAbility } from './app-ability';
import type { RequestWithAbility } from './request-with-ability';

/**
 * Injects the CASL ability built by the PoliciesGuard for this request.
 * Only valid on routes guarded with `@UseGuards(PoliciesGuard)`.
 */
export const CurrentAbility = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AppAbility => {
    const request = context.switchToHttp().getRequest<RequestWithAbility>();
    if (!request.ability) {
      throw new Error(
        'request.ability missing — is PoliciesGuard applied to this route?',
      );
    }
    return request.ability;
  },
);
