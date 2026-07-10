import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CaslAbilityFactory } from './casl-ability.factory';
import {
  CHECK_POLICIES_KEY,
  type PolicyHandler,
} from './check-policies.decorator';
import type { RequestWithAbility } from './request-with-ability';

/**
 * Builds the CASL ability once per request (stored on `request.ability`)
 * and evaluates the policy handlers declared via `@CheckPolicies()`.
 * Runs after the global JwtAuthGuard, so `request.user` is already set.
 */
@Injectable()
export class PoliciesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: CaslAbilityFactory,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAbility>();
    if (!request.user) {
      // The global JwtAuthGuard should have run already.
      throw new UnauthorizedException();
    }

    request.ability ??= await this.abilityFactory.createForUser(request.user);
    const ability = request.ability;

    const handlers =
      this.reflector.getAllAndOverride<PolicyHandler[] | undefined>(
        CHECK_POLICIES_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? [];

    if (!handlers.every((handler) => handler(ability))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
