import { request, requestBlob } from "./httpClient";

// Taxpayer public consultation (HU24 / SL-73) -- an UNAUTHENTICATED channel:
// every call uses `authenticated: false`, so the Administrator's JWT is never
// attached and a 401 never ends their session.
//
// PROPOSED CONTRACT, written before the SL-84 backend endpoint existed. The
// routes and shapes below follow the backend conventions (English routes like
// /tax-roll, schema.prisma field names: cadastralCode, address, period,
// totalAmount, issuedAt). If the backend differs, this is the ONLY file to
// adjust -- the page depends only on these types.

export const PUBLIC_CONSULTATION_PATH = "/public-consultation";

// RF-15: 2 or 3 of these fields are sent. Fields the taxpayer leaves empty
// are NOT sent (not even as an empty string). The frontend only trims;
// the EXACT match (RNF-04) is decided by the backend.
export interface PublicConsultationCriteria {
  cadastralCode?: string;
  ownerName?: string;
  address?: string;
}

// A current settlement of the property (Settlement with status ACTIVE).
export interface PublicSettlement {
  id: number;
  period: string;
  issuedAt: string;
  // Prisma serializes Decimal as a string -- formatted in the UI.
  totalAmount: string;
}

export interface PublicConsultationResult {
  property: {
    cadastralCode: string;
    address: string;
  };
  settlements: PublicSettlement[];
}

// With no exact match a 404 is expected (or a 200 with `settlements: []`);
// the page treats both the same and never shows suggestions.
export function consultSettlements(
  criteria: PublicConsultationCriteria,
  signal?: AbortSignal,
) {
  return request<PublicConsultationResult>(PUBLIC_CONSULTATION_PATH, {
    method: "POST",
    body: criteria,
    authenticated: false,
    signal,
  });
}

// RF-16: the PDF is generated on demand (never stored on the server).
//
// It is requested via POST, resending the SAME consultation data, rather
// than with a GET /.../:id/pdf: this lets the backend re-validate the
// 2-of-3 match before generating the PDF, so nobody can download other
// people's settlements by walking sequential ids.
export function downloadSettlementPdf(
  criteria: PublicConsultationCriteria,
  settlementId: number,
) {
  return requestBlob(`${PUBLIC_CONSULTATION_PATH}/pdf`, {
    method: "POST",
    body: { ...criteria, settlementId },
    authenticated: false,
  });
}
