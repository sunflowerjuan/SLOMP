import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { MunicipalityContext } from './municipality-context.js';

// Only usable on routes behind MunicipalityGuard.
export const CurrentMunicipality = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MunicipalityContext => {
    const request = context.switchToHttp().getRequest();
    return request.municipality;
  },
);
