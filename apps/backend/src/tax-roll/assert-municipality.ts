import { BadRequestException } from '@nestjs/common';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { checkCadastralDanePrefix } from './validate-dane-prefix.js';

// The whole file is rejected, before anything is saved, if any cadastral code
// does not start with the active municipality's DANE code. Shared by the tax
// roll and the payment orders uploads.
export async function assertCadastralCodesBelongToMunicipality(
  prisma: Pick<PrismaService, 'municipality'>,
  municipality: MunicipalityContext,
  cadastralCodes: readonly string[],
): Promise<void> {
  const check = checkCadastralDanePrefix(cadastralCodes, municipality.daneCode);
  if (check.matches) return;

  const registered = await prisma.municipality.findMany({
    where: { daneCode: { in: check.foundPrefixes.map((p) => p.prefix) } },
    select: { daneCode: true, name: true, state: true },
  });
  const nameByDane = new Map(
    registered.map((m) => [m.daneCode, `${m.name}, ${m.state}`]),
  );
  const foundPrefixes = check.foundPrefixes.map((entry) => ({
    ...entry,
    municipality: nameByDane.get(entry.prefix) ?? null,
  }));
  const guess = foundPrefixes.find((entry) => entry.municipality);

  throw new BadRequestException(
    errorBody(
      ErrorCode.TAX_ROLL_WRONG_MUNICIPALITY,
      guess
        ? `This file seems to belong to ${guess.municipality}, not to ${municipality.name}, ${municipality.state}.`
        : `${check.mismatchedRows} cadastral code(s) do not start with the DANE code ${municipality.daneCode} of ${municipality.name}, ${municipality.state}.`,
      {
        expectedPrefix: municipality.daneCode,
        mismatchedRows: check.mismatchedRows,
        foundPrefixes,
      },
    ),
  );
}
