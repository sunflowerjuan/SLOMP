import { request, requestBlob } from "./httpClient";

// Consulta publica del contribuyente (HU24 / SL-73) -- canal SIN
// autenticacion: todas las llamadas van con `authenticated: false`, asi que
// nunca se adjunta el JWT del Administrador ni un 401 cierra su sesion.
//
// CONTRATO PROPUESTO, PENDIENTE DE CONFIRMAR CON SL-84: el endpoint publico
// todavia no existe en apps/backend. Las rutas y formas de abajo siguen las
// convenciones del backend actual (rutas en ingles como /tax-roll, nombres
// de campo del schema.prisma: cadastralCode, address, period, totalAmount,
// issuedAt). Si SL-84 define algo distinto, este es el UNICO archivo que hay
// que ajustar -- la pantalla solo depende de estos tipos.

export const PUBLIC_CONSULTATION_PATH = "/public-consultation";

// RF-15: se envian 2 o 3 de estos datos. Los que el contribuyente deja
// vacios NO se envian (ni como string vacio). El frontend solo hace trim();
// la coincidencia EXACTA (RNF-04) la decide el backend.
export interface PublicConsultationCriteria {
  cadastralCode?: string;
  ownerName?: string;
  address?: string;
}

// Una liquidacion vigente (Settlement con status ACTIVE) del predio.
export interface PublicSettlement {
  id: number;
  period: string;
  issuedAt: string;
  // Prisma serializa Decimal como string -- se formatea en la UI.
  totalAmount: string;
}

export interface PublicConsultationResult {
  property: {
    cadastralCode: string;
    address: string;
  };
  settlements: PublicSettlement[];
}

// Sin coincidencia exacta se espera un 404 (o 200 con `settlements: []`);
// la pantalla trata ambos casos igual y nunca muestra sugerencias.
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

// RF-16: el PDF se genera bajo demanda (nunca se guarda en el servidor).
//
// Se pide por POST reenviando los MISMOS datos de la consulta, no con un
// GET /.../:id/pdf: asi el backend puede volver a validar la coincidencia
// de 2 de 3 datos antes de generar el PDF y nadie puede descargar
// liquidaciones ajenas recorriendo ids secuenciales.
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
