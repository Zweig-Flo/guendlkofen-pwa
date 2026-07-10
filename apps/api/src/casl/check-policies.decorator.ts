import { SetMetadata } from '@nestjs/common';
import type { AppAbility } from './app-ability';

/**
 * A coarse, route-level policy check evaluated by the PoliciesGuard.
 * Record-level (conditional) checks belong in the services, where the
 * record is loaded.
 */
export type PolicyHandler = (ability: AppAbility) => boolean;

export const CHECK_POLICIES_KEY = 'check_policies';

export const CheckPolicies = (...handlers: PolicyHandler[]) =>
  SetMetadata(CHECK_POLICIES_KEY, handlers);
