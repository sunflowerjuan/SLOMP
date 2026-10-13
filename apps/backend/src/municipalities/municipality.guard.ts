import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Resolves :slug to a municipality before the handler runs and leaves it on
// the request for @CurrentMunicipality(). An unknown slug is a 404.
@Injectable()
export class MunicipalityGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const slug: unknown = request.params?.slug;

    const municipality =
      typeof slug === 'string'
        ? await this.prisma.municipality.findUnique({
            where: { slug },
            select: {
              id: true,
              slug: true,
              name: true,
              state: true,
              daneCode: true,
            },
          })
        : null;
    if (!municipality) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.MUNICIPALITY_NOT_FOUND,
          `Municipality "${String(slug)}" not found.`,
        ),
      );
    }

    request.municipality = municipality;
    return true;
  }
}
