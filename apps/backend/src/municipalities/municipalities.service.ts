import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateMunicipalityDto,
  UpdateMunicipalityDto,
} from './municipality.dto.js';
import type { MunicipalityContext } from './municipality-context.js';
import {
  isValidDaneCode,
  isValidSlug,
  suggestSlug,
} from './municipality-rules.js';

const MUNICIPALITY_SELECT = {
  id: true,
  slug: true,
  name: true,
  state: true,
  daneCode: true,
} as const;

@Injectable()
export class MunicipalitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<MunicipalityContext[]> {
    return this.prisma.municipality.findMany({
      select: MUNICIPALITY_SELECT,
      orderBy: [{ name: 'asc' }, { state: 'asc' }],
    });
  }

  async create(dto: CreateMunicipalityDto): Promise<MunicipalityContext> {
    const name = dto.name.trim();
    const state = dto.state.trim();
    const daneCode = dto.daneCode.trim();
    const slug = dto.slug?.trim() || suggestSlug(name);
    this.assertValidDaneCode(daneCode);
    this.assertValidSlug(slug);
    await this.assertAvailable({ daneCode, slug });

    try {
      return await this.prisma.municipality.create({
        data: { name, state, daneCode, slug },
        select: MUNICIPALITY_SELECT,
      });
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  // Name and state can always change. The slug (it is in the URLs and in the
  // iframes handed to each municipality) and the DANE code (it validates the
  // cadastral codes) are frozen once the municipality has any data.
  async update(
    municipality: MunicipalityContext,
    dto: UpdateMunicipalityDto,
  ): Promise<MunicipalityContext> {
    const data: Prisma.MunicipalityUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.state !== undefined) data.state = dto.state.trim();

    const newSlug = dto.slug?.trim();
    const newDaneCode = dto.daneCode?.trim();
    const slugChanges = newSlug !== undefined && newSlug !== municipality.slug;
    const daneChanges =
      newDaneCode !== undefined && newDaneCode !== municipality.daneCode;

    if (slugChanges || daneChanges) {
      if (await this.hasData(municipality.id)) {
        throw new ConflictException(
          errorBody(
            ErrorCode.MUNICIPALITY_IMMUTABLE_FIELD,
            'The slug and the DANE code cannot change once the municipality has data.',
            {
              fields: [slugChanges && 'slug', daneChanges && 'daneCode'].filter(
                Boolean,
              ),
            },
          ),
        );
      }
      if (slugChanges) {
        this.assertValidSlug(newSlug);
        data.slug = newSlug;
      }
      if (daneChanges) {
        this.assertValidDaneCode(newDaneCode);
        data.daneCode = newDaneCode;
      }
      await this.assertAvailable({
        slug: slugChanges ? newSlug : undefined,
        daneCode: daneChanges ? newDaneCode : undefined,
      });
    }

    try {
      return await this.prisma.municipality.update({
        where: { id: municipality.id },
        data,
        select: MUNICIPALITY_SELECT,
      });
    } catch (error) {
      throw this.translateUniqueViolation(error);
    }
  }

  private async hasData(municipalityId: number): Promise<boolean> {
    const counts = await this.prisma.municipality.findUnique({
      where: { id: municipalityId },
      select: {
        _count: {
          select: {
            properties: true,
            owners: true,
            resolutions: true,
            taxRollImports: true,
          },
        },
      },
    });
    return Object.values(counts?._count ?? {}).some((count) => count > 0);
  }

  private assertValidDaneCode(daneCode: string): void {
    if (!isValidDaneCode(daneCode)) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.MUNICIPALITY_INVALID_DANE,
          'The DANE code must be exactly 5 digits.',
        ),
      );
    }
  }

  private assertValidSlug(slug: string): void {
    if (!isValidSlug(slug)) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.MUNICIPALITY_INVALID_SLUG,
          'The slug may only contain lowercase letters, digits and single hyphens between them.',
        ),
      );
    }
  }

  private async assertAvailable(values: {
    slug?: string;
    daneCode?: string;
  }): Promise<void> {
    if (values.daneCode !== undefined) {
      const taken = await this.prisma.municipality.findUnique({
        where: { daneCode: values.daneCode },
        select: { id: true },
      });
      if (taken) throw this.daneTaken();
    }
    if (values.slug !== undefined) {
      const taken = await this.prisma.municipality.findUnique({
        where: { slug: values.slug },
        select: { id: true },
      });
      if (taken) throw this.slugTaken();
    }
  }

  // Two requests can both pass assertAvailable; the unique index decides.
  private translateUniqueViolation(error: unknown): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const target = JSON.stringify(error.meta?.target ?? '');
      return target.includes('slug') ? this.slugTaken() : this.daneTaken();
    }
    return error;
  }

  private daneTaken(): ConflictException {
    return new ConflictException(
      errorBody(
        ErrorCode.MUNICIPALITY_DANE_TAKEN,
        'Another municipality already uses this DANE code.',
      ),
    );
  }

  private slugTaken(): ConflictException {
    return new ConflictException(
      errorBody(
        ErrorCode.MUNICIPALITY_SLUG_TAKEN,
        'Another municipality already uses this slug.',
      ),
    );
  }
}
