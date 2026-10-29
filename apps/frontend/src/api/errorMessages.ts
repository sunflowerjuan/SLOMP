// Single catalog of the texts the user sees for every backend error code.
// The backend only sends stable codes (see apps/backend/src/common/errors/
// error-codes.ts); the wording lives here so it can follow one style:
//   1. What happened, in plain words (no codes, ids or tool names).
//   2. What the user can do next, when there is something to do.
//   Informal "tú", full sentences ending in a period.

import { paymentOrderNumberLabel } from "../domain/paymentOrder";
import { MAX_TEMPLATE_NAME_LENGTH } from "../domain/templateMarking";
import type {
  MarkingProblem,
  TemplateNameProblem,
} from "../domain/templateMarking";
import { formatNumber } from "../utils/formatCount";
import { formatPeriods } from "../utils/formatPeriods";

export type ErrorDetails = Record<string, unknown>;

// Who is reading the message: the Administrator (panel) or the taxpayer
// (public consultation), who cannot fix templates or data themselves.
export type MessageAudience = "admin" | "public";

// Which document a PDF, template or bulk job error is about: the codes are
// shared by liquidations and payment orders, the wording isn't.
export type MessageDocument = "LIQUIDACION" | "MANDAMIENTO";

type MessageBuilder = (details: ErrorDetails) => string;
type CatalogEntry = string | MessageBuilder;

export const GENERIC_ERROR_MESSAGES = {
  unexpected: "Ocurrió un error inesperado. Intenta de nuevo.",
  network:
    "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.",
  invalidRequest:
    "No se pudo completar la acción. Revisa los datos ingresados e intenta de nuevo.",
} as const;

const PUBLIC_CONTACT =
  "Intenta más tarde o acércate a la Secretaría de Hacienda del municipio.";

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function joinWithY(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

// Years and row numbers, as written.
function numberOr(value: unknown, fallback: string): string {
  return typeof value === "number" ? String(value) : fallback;
}

// Quantities, with the thousands separator.
function countOr(value: unknown, fallback: string): string {
  return typeof value === "number" ? formatNumber(value) : fallback;
}

const MISSING_LIQUIDATION_FIELD_LABELS: Record<string, string> = {
  CADASTRAL_CODE: "la cédula catastral",
  PROPERTY_ADDRESS: "la dirección del predio",
  SETTLEMENT_PERIODS: "los periodos liquidados",
  SETTLEMENT_DETAILS: "el detalle de conceptos",
  SETTLEMENT_VALUES: "valores válidos en los conceptos",
  LIQUIDATION_NUMBER: "el número de la liquidación",
};

function missingLiquidationLabels(missing: string[]): string[] {
  return missing.map((key) => MISSING_LIQUIDATION_FIELD_LABELS[key] ?? key);
}

// One line of the bulk LIQUIDATION_DATA_INCOMPLETE list, e.g. "Falta la
// dirección del predio."
export function missingLiquidationDataText(missing: string[]): string {
  const labels = missingLiquidationLabels(missing);
  if (labels.length === 0) return "Faltan datos.";
  return `${labels.length > 1 ? "Faltan" : "Falta"} ${joinWithY(labels)}.`;
}

// What the new password still needs, per violation the backend reports
// (security policy, 4.3). COMMON gets its own sentence below.
const PASSWORD_RULE_LABELS: Record<string, string> = {
  TOO_SHORT: "tener al menos 12 caracteres",
  TOO_LONG: "ser más corta (hasta 72 caracteres)",
  SAME_AS_CURRENT: "ser distinta de la actual",
};

const COMMON_PASSWORD_ADVICE =
  "evita palabras conocidas, secuencias como 123456 y números o símbolos al final";

function passwordPolicyMessage(details: ErrorDetails): string {
  const violations = stringList(details.violations);
  const rules = violations
    .map((violation) => PASSWORD_RULE_LABELS[violation])
    .filter(Boolean);
  const isCommon = violations.includes("COMMON");
  if (rules.length === 0 && !isCommon) {
    return "La nueva contraseña no cumple la política de contraseñas. Usa al menos 12 caracteres y evita contraseñas comunes.";
  }
  const sentences: string[] = [];
  if (rules.length > 0) {
    sentences.push(`La nueva contraseña debe ${joinWithY(rules)}.`);
  }
  if (isCommon) {
    sentences.push(
      rules.length > 0
        ? `Además, es muy común o fácil de adivinar: ${COMMON_PASSWORD_ADVICE}.`
        : `La nueva contraseña es muy común o fácil de adivinar: ${COMMON_PASSWORD_ADVICE}.`,
    );
  }
  return sentences.join(" ");
}

// Why a text selection of the guided marking can't take a marker. The screen
// checks it before asking the backend, which answers the same cases with
// TEMPLATE_SELECTION_INVALID or TEMPLATE_SELECTION_OVERLAP.
export const MARKING_PROBLEM_MESSAGES: Record<MarkingProblem, string> = {
  CROSSES_BLOCKS:
    "Selecciona texto dentro de un solo párrafo o de una sola celda. No se asignó ningún marcador.",
  EMPTY:
    "Selecciona las palabras que quieres reemplazar por el marcador, no solo espacios.",
  OVERLAP:
    "Ese texto ya tiene un marcador. Quítalo primero o selecciona otro texto.",
  OUTSIDE_TABLE:
    "Los campos de la tabla solo se marcan en la fila de ejemplo de una tabla del documento.",
  OTHER_ROW:
    "Los campos de la tabla van todos en la misma fila de ejemplo: usa la fila que ya marcaste.",
  IN_REMOVED_ROW:
    "Esa fila se quitará del documento. Restáurala si quieres marcar en ella.",
};

// Why the name a template is saved under can't be used (checked on screen,
// like the backend's TEMPLATE_FILE_NAME_INVALID).
export const TEMPLATE_NAME_MESSAGES: Record<TemplateNameProblem, string> = {
  EMPTY: "Escribe el nombre con el que se guardará la plantilla.",
  TOO_LONG: `El nombre puede tener hasta ${MAX_TEMPLATE_NAME_LENGTH} caracteres.`,
  FORBIDDEN: "El nombre no puede tener barras (/ o \\).",
};

// Why a table row can't be left out of the template (`reason` of
// TEMPLATE_SELECTION_INVALID when removing rows).
const REMOVED_ROW_MESSAGES: Record<string, string> = {
  REMOVED_ROW_HAS_MARKER:
    "Una de las filas que quitaste tiene marcadores. Quita sus marcadores o restaura la fila e intenta de nuevo.",
  REMOVED_ROW_LAST:
    "No se pueden quitar todas las filas de una tabla. Restaura al menos una e intenta de nuevo.",
  REMOVED_ROW_OUTSIDE_TABLE:
    "Una de las filas que quitaste ya no está en una tabla. Restáurala e intenta de nuevo.",
};

const SELECTION_REASON_PROBLEMS: Record<string, MarkingProblem> = {
  EMPTY: "EMPTY",
  ROW_FIELD_OUTSIDE_TABLE: "OUTSIDE_TABLE",
  ROWS_IN_SEVERAL_ROWS: "OTHER_ROW",
  ROWS_IN_SEVERAL_TABLES: "OTHER_ROW",
};

const ERROR_MESSAGES: Record<string, CatalogEntry> = {
  // Generic
  BAD_REQUEST: GENERIC_ERROR_MESSAGES.invalidRequest,
  REQUEST_VALIDATION_FAILED:
    "Algunos datos enviados no son válidos. Revisa el formulario e intenta de nuevo.",
  UNAUTHORIZED: "Tu sesión expiró. Vuelve a iniciar sesión para continuar.",
  FORBIDDEN: "No tienes permisos para realizar esta acción.",
  RESOURCE_NOT_FOUND:
    "No encontramos la información solicitada. Actualiza la página e intenta de nuevo.",
  CONFLICT:
    "La información cambió mientras realizabas la acción. Actualiza la página e intenta de nuevo.",
  PAYLOAD_TOO_LARGE: "El archivo es demasiado grande.",
  RATE_LIMITED:
    "Realizaste demasiadas consultas en poco tiempo. Espera unos minutos e intenta de nuevo.",
  SERVICE_UNAVAILABLE:
    "El servicio no está disponible en este momento. Intenta de nuevo en unos minutos.",
  INTERNAL_ERROR:
    "El servidor tuvo un problema. Intenta de nuevo en unos minutos.",

  // Authentication
  AUTH_CREDENTIALS_REQUIRED: "Ingresa tu correo electrónico y tu contraseña.",
  AUTH_INVALID_CREDENTIALS: "Correo o contraseña incorrectos.",
  AUTH_SESSION_INVALID:
    "Tu sesión ya no es válida. Vuelve a iniciar sesión para continuar.",
  AUTH_PASSWORD_CHANGE_REQUIRED:
    "Debes cambiar tu contraseña antes de continuar. Vuelve a iniciar sesión para hacerlo.",
  AUTH_CURRENT_PASSWORD_INVALID:
    "La contraseña actual no es correcta. Revísala e intenta de nuevo.",
  AUTH_PASSWORD_POLICY_VIOLATION: passwordPolicyMessage,

  // Tax roll upload
  TAX_ROLL_FILE_MISSING: "Selecciona un archivo de Excel (.xlsx) para cargar.",
  TAX_ROLL_FILE_EXTENSION:
    "El archivo debe tener extensión .xlsx. Guárdalo como «Libro de Excel (.xlsx)» e intenta de nuevo.",
  TAX_ROLL_FILE_TOO_LARGE: (details) =>
    `El archivo supera el tamaño máximo permitido de ${numberOr(details.maxSizeMb, "10")} MB. Verifica que seleccionaste el archivo de cartera correcto.`,
  TAX_ROLL_FILE_EMPTY:
    "El archivo está vacío (0 bytes). Verifica que seleccionaste el archivo correcto.",
  TAX_ROLL_NOT_XLSX:
    "El archivo no es un Excel válido (.xlsx). Puede ser otro formato renombrado (CSV, .xls antiguo, PDF) o un archivo dañado. Ábrelo en Excel y guárdalo como «Libro de Excel (.xlsx)».",
  TAX_ROLL_NO_HEADER_ROW:
    "El Excel está vacío: la primera fila no tiene encabezados. Verifica que es el archivo de cartera.",
  TAX_ROLL_HEADERS_MISMATCH: (details) => {
    const missing = stringList(details.missingColumns);
    if (missing.length > 0) {
      return `Las columnas del Excel no coinciden con el formato de cartera. Faltan: ${joinWithY(missing)}.`;
    }
    const expected = stringList(details.expectedColumns);
    return expected.length > 0
      ? `Las columnas del Excel están en un orden distinto al esperado. El orden correcto es: ${expected.join(", ")}.`
      : "Las columnas del Excel no coinciden con el formato de cartera.";
  },
  TAX_ROLL_NO_DATA_ROWS:
    "El Excel tiene los encabezados correctos pero no contiene filas de datos.",
  TAX_ROLL_UNREADABLE:
    "No se pudo leer el archivo de Excel. Ábrelo en Excel, guárdalo de nuevo e intenta otra vez.",
  TAX_ROLL_WRONG_MUNICIPALITY: (details) => {
    const found = Array.isArray(details.foundPrefixes)
      ? (details.foundPrefixes as { municipality?: string | null }[])
      : [];
    const guess = found.find((entry) => entry.municipality)?.municipality;
    return guess
      ? `Este archivo parece ser de ${guess}, no del municipio en el que estás trabajando. No se guardó nada.`
      : `Algunas cédulas catastrales del archivo no empiezan por el código DANE ${String(details.expectedPrefix ?? "")} del municipio en el que estás trabajando. No se guardó nada.`;
  },

  // Municipalities
  MUNICIPALITY_NOT_FOUND: "No encontramos el municipio.",
  MUNICIPALITY_INVALID_DANE: "El código DANE debe tener exactamente 5 dígitos.",
  MUNICIPALITY_INVALID_SLUG:
    "El identificador solo puede tener letras minúsculas, números y guiones entre ellos.",
  MUNICIPALITY_DANE_TAKEN: "Ya existe un municipio con ese código DANE.",
  MUNICIPALITY_SLUG_TAKEN: "Ya existe un municipio con ese identificador.",
  MUNICIPALITY_IMMUTABLE_FIELD:
    "El identificador y el código DANE no se pueden cambiar cuando el municipio ya tiene datos.",

  // Document templates
  TEMPLATE_FILE_MISSING: "Adjunta la plantilla en formato .docx.",
  TEMPLATE_FILE_EXTENSION:
    "La plantilla debe ser un archivo de Word con extensión .docx.",
  TEMPLATE_FILE_TOO_LARGE: (details) =>
    `La plantilla supera el tamaño máximo de ${numberOr(details.maxSizeMb, "5")} MB.`,
  TEMPLATE_NOT_DOCX:
    "El archivo no es un documento de Word válido. Ábrelo en Word, guárdalo como .docx e intenta de nuevo.",
  TEMPLATE_HAS_MACROS:
    "La plantilla tiene macros, que no se permiten. Guárdala como .docx sin macros e intenta de nuevo.",
  TEMPLATE_MARKERS_MALFORMED: (details) => {
    const markers = Array.isArray(details.problems)
      ? (details.problems as { marker?: string }[])
          .map((problem) => problem.marker)
          .filter((marker): marker is string => typeof marker === "string")
          .map((marker) => `{${marker}}`)
      : [];
    return `La plantilla no se activó porque tiene marcadores mal escritos${markers.length > 0 ? ` (${joinWithY([...new Set(markers)])})` : ""}. Revisa que cada llave abierta se cierre y que cada sección {#campo} termine con {/campo}.`;
  },
  // `missing` holds technical names, never shown: the screen that knows the
  // catalog puts their Spanish names in `missingLabels`. `unknown` are
  // markers the lawyer wrote in the file, so they are shown as written.
  TEMPLATE_FIELDS_INVALID: (details) => {
    const missingLabels = stringList(details.missingLabels).map(
      (label) => `«${label}»`,
    );
    const missingCount = stringList(details.missing).length;
    const unknown = stringList(details.unknown).map((item) => `{${item}}`);
    const parts = [
      missingLabels.length > 0
        ? `le ${missingLabels.length > 1 ? "faltan" : "falta"} ${joinWithY(missingLabels)}`
        : missingCount > 0
          ? "le faltan marcadores obligatorios"
          : "",
      unknown.length > 0
        ? `${unknown.length > 1 ? "tiene marcadores" : "tiene un marcador"} que el sistema no reconoce: ${joinWithY(unknown)}`
        : "",
    ].filter(Boolean);
    return `La plantilla no se activó: ${parts.join(" y ") || "sus marcadores no coinciden con los campos del sistema"}. Corrígela e intenta de nuevo; la plantilla activa sigue siendo la anterior.`;
  },
  TEMPLATE_TYPE_UNSUPPORTED:
    "Todavía no se pueden cargar plantillas de este tipo de documento.",
  TEMPLATE_NOT_FOUND:
    "No encontramos la plantilla. Actualiza la lista e intenta de nuevo.",
  TEMPLATE_DRAFT_NOT_FOUND:
    "Este borrador ya no existe. Vuelve a subir el documento para marcarlo.",
  TEMPLATE_DRAFT_EXPIRED:
    "El borrador venció: se conserva 24 horas. Vuelve a subir el documento para marcarlo.",
  TEMPLATE_BLOCK_NOT_FOUND:
    "Una parte del documento que marcaste ya no se encuentra. Cancela el borrador y vuelve a subir el documento.",
  TEMPLATE_SELECTION_INVALID: (details) => {
    const reason = typeof details.reason === "string" ? details.reason : "";
    if (reason === "TOO_MANY") {
      return "Asignaste demasiados marcadores. Quita algunos e intenta de nuevo.";
    }
    if (REMOVED_ROW_MESSAGES[reason]) return REMOVED_ROW_MESSAGES[reason];
    const problem = SELECTION_REASON_PROBLEMS[reason];
    return problem
      ? MARKING_PROBLEM_MESSAGES[problem]
      : "Uno de los marcadores no se pudo aplicar. Quítalo, vuelve a asignarlo e intenta de nuevo.";
  },
  TEMPLATE_SELECTION_OVERLAP: MARKING_PROBLEM_MESSAGES.OVERLAP,
  TEMPLATE_FIELD_UNKNOWN:
    "Uno de los marcadores no existe para este tipo de documento. Quítalo, vuelve a asignarlo e intenta de nuevo.",
  TEMPLATE_REPLACE_NOT_CONFIRMED:
    "Este municipio ya tiene una plantilla activa de este tipo. Confirma el reemplazo para guardar la nueva.",
  TEMPLATE_FILE_NAME_INVALID: (details) =>
    `El nombre de la plantilla debe tener entre 1 y ${numberOr(details.maxLength, "120")} caracteres, sin barras (/ o \\). Corrígelo e intenta de nuevo.`,
  TEMPLATE_PREVIEW_FAILED:
    "No se pudo generar la vista previa. Intenta de nuevo; si el problema continúa, contacta al equipo de soporte.",

  // Settlements (Administrator panel)
  SETTLEMENT_SEARCH_CRITERIA_REQUIRED:
    "Ingresa al menos un criterio (cédula catastral, propietario o dirección).",
  SETTLEMENT_NOT_FOUND:
    "No encontramos la liquidación. Puede que haya sido reemplazada; actualiza la búsqueda e intenta de nuevo.",
  SETTLEMENT_STATUS_INVALID:
    "El estado seleccionado no es válido para una liquidación.",
  SETTLEMENT_ALREADY_REPLACED:
    "No se puede cambiar el estado de una liquidación que ya fue reemplazada.",
  SETTLEMENT_STATUS_TRANSITION_NOT_ALLOWED:
    "Ese cambio de estado no está permitido para esta liquidación.",
  SETTLEMENT_STATUS_CHANGED:
    "Otra persona o proceso cambió esta liquidación mientras la editabas. Actualiza la búsqueda e intenta de nuevo.",

  // Payment orders
  PAYMENT_ORDER_CONCURRENT_GENERATION:
    "Otra solicitud ya generó el mandamiento de una de estas liquidaciones. Actualiza la lista e intenta de nuevo.",
  PAYMENT_ORDER_NOT_FOUND:
    "No encontramos el mandamiento. Actualiza la lista e intenta de nuevo.",
  PAYMENT_ORDER_INELIGIBLE:
    "Algunas liquidaciones ya no cumplen las condiciones para generar su mandamiento. Vuelve a cargar el Excel y revisa cuáles se pueden generar.",

  // Public consultation
  PUBLIC_QUERY_CRITERIA_REQUIRED:
    "Ingresa al menos 2 de los 3 datos del predio para realizar la consulta.",

  // Liquidation PDF / bulk ZIP
  LIQUIDATION_DATA_INCOMPLETE: (details) => {
    // Bulk generation: the whole list of incomplete liquidations comes in
    // details.documents and the screen lists them below this text.
    if (Array.isArray(details.documents)) {
      const count = details.documents.length;
      return count === 1
        ? "No se puede generar el ZIP porque una liquidación tiene datos incompletos. Complétala e intenta de nuevo."
        : `No se puede generar el ZIP porque ${count} liquidaciones tienen datos incompletos. Complétalas e intenta de nuevo.`;
    }
    const labels = missingLiquidationLabels(stringList(details.missing));
    return labels.length > 0
      ? `No se puede generar el PDF porque a la liquidación le ${labels.length > 1 ? "faltan" : "falta"} ${joinWithY(labels)}. Completa esos datos e intenta de nuevo.`
      : "No se puede generar el PDF porque a la liquidación le faltan datos. Completa la liquidación e intenta de nuevo.";
  },
  LIQUIDATION_CONCURRENT_GENERATION:
    "Otra solicitud acaba de generar una liquidación para estos periodos. Actualiza la búsqueda e intenta de nuevo.",
  PDF_TEMPLATE_UNAVAILABLE:
    "Este municipio no tiene una plantilla de liquidación activa. Sube una plantilla .docx e intenta de nuevo.",
  PDF_TEMPLATE_INVALID:
    "La plantilla de la liquidación está dañada o no es válida. Reemplázala por una plantilla .docx válida e intenta de nuevo.",
  PDF_CONVERSION_TIMEOUT:
    "La generación del PDF tardó demasiado y se canceló. Intenta de nuevo; si el problema continúa, contacta al equipo de soporte.",
  PDF_CONVERSION_FAILED:
    "No se pudo convertir la liquidación a PDF y no se generó ningún archivo. Intenta de nuevo; si el problema continúa, contacta al equipo de soporte.",
  TEMPLATE_RENDER_FAILED:
    "No se pudo llenar la plantilla de la liquidación con estos datos. Contacta al equipo de soporte.",
  PDF_STORAGE_UNAVAILABLE:
    "El almacenamiento de documentos no responde. Intenta de nuevo en unos minutos.",
  PDF_SERVICE_NOT_CONFIGURED:
    "La generación de documentos no está disponible en este momento. Contacta al equipo de soporte.",
  NO_PENDING_LIQUIDATIONS: "No hay liquidaciones de este tipo para generar.",
  BULK_GENERATION_IN_PROGRESS:
    "Hay una generación masiva en curso en este municipio. Espera a que termine e intenta de nuevo.",
  BULK_JOB_NOT_FOUND:
    "No encontramos la generación solicitada. Inicia una nueva.",
  BULK_JOB_NOT_READY:
    "La generación todavía no termina. Espera unos segundos e intenta de nuevo.",
  BULK_JOB_EXPIRED:
    "El ZIP de esta generación ya venció. Inicia una nueva generación para descargarlo.",
  // Job states (errorCode of a FAILED job), not HTTP responses.
  BULK_JOB_STALLED:
    "La generación masiva se detuvo y se canceló sin consumir números de resolución. Inicia una nueva; si se repite, contacta al equipo de soporte.",
  BULK_ZIP_INCOMPLETE:
    "No se pudo armar el ZIP completo y la generación se canceló sin consumir números de resolución. Intenta de nuevo.",
  BULK_LIMIT_EXCEEDED: (details) =>
    `Hay ${countOr(details.count, "demasiadas")} liquidaciones pendientes y el máximo por descarga masiva es ${countOr(details.max, "10.000")}. Contacta al equipo de soporte para generarlas por partes.`,
};

// The taxpayer cannot fix templates or the liquidation's data, so these codes
// get a message that points to the municipality instead.
const PUBLIC_OVERRIDES: Record<string, CatalogEntry> = {
  SETTLEMENT_NOT_FOUND:
    "No encontramos la liquidación solicitada. Realiza la consulta de nuevo.",
  LIQUIDATION_DATA_INCOMPLETE: `No es posible generar este documento en este momento. ${PUBLIC_CONTACT}`,
  LIQUIDATION_CONCURRENT_GENERATION:
    "El documento se está generando en este momento. Intenta de nuevo en unos segundos.",
  PDF_TEMPLATE_UNAVAILABLE: `No es posible generar este documento en este momento. ${PUBLIC_CONTACT}`,
  PDF_TEMPLATE_INVALID: `No es posible generar este documento en este momento. ${PUBLIC_CONTACT}`,
  TEMPLATE_RENDER_FAILED: `No es posible generar este documento en este momento. ${PUBLIC_CONTACT}`,
  PDF_STORAGE_UNAVAILABLE: `No es posible generar este documento en este momento. ${PUBLIC_CONTACT}`,
  PDF_SERVICE_NOT_CONFIGURED: `No es posible generar este documento en este momento. ${PUBLIC_CONTACT}`,
  PDF_CONVERSION_TIMEOUT:
    "La generación del documento tardó demasiado. Intenta de nuevo en unos minutos.",
  PDF_CONVERSION_FAILED:
    "No se pudo generar el documento. Intenta de nuevo en unos minutos.",
};

// The same codes when the document is a payment order (Mandamientos screen).
const PAYMENT_ORDER_OVERRIDES: Record<string, CatalogEntry> = {
  LIQUIDATION_DATA_INCOMPLETE: (details) => {
    if (Array.isArray(details.documents)) {
      const count = details.documents.length;
      return count === 1
        ? "No se puede generar el ZIP porque un mandamiento tiene datos incompletos. Completa su liquidación e intenta de nuevo."
        : `No se puede generar el ZIP porque ${count} mandamientos tienen datos incompletos. Completa sus liquidaciones e intenta de nuevo.`;
    }
    const labels = missingLiquidationLabels(stringList(details.missing));
    return labels.length > 0
      ? `No se puede generar el PDF porque al mandamiento le ${labels.length > 1 ? "faltan" : "falta"} ${joinWithY(labels)}. Completa esos datos e intenta de nuevo.`
      : "No se puede generar el PDF porque al mandamiento le faltan datos. Completa su liquidación e intenta de nuevo.";
  },
  PDF_TEMPLATE_UNAVAILABLE:
    "Este municipio no tiene una plantilla de mandamiento activa. Súbela en Plantillas e intenta de nuevo.",
  PDF_TEMPLATE_INVALID:
    "La plantilla del mandamiento está dañada o no es válida. Reemplázala por una plantilla .docx válida e intenta de nuevo.",
  PDF_CONVERSION_FAILED:
    "No se pudo convertir el mandamiento a PDF y no se generó ningún archivo. Intenta de nuevo; si el problema continúa, contacta al equipo de soporte.",
  TEMPLATE_RENDER_FAILED:
    "No se pudo llenar la plantilla del mandamiento con estos datos. Contacta al equipo de soporte.",
  BULK_JOB_STALLED:
    "La generación masiva se detuvo y se canceló sin consumir números de mandamiento. Inicia una nueva; si se repite, contacta al equipo de soporte.",
  BULK_ZIP_INCOMPLETE:
    "No se pudo armar el ZIP completo y la generación se canceló sin consumir números de mandamiento. Intenta de nuevo.",
  BULK_LIMIT_EXCEEDED: (details) =>
    `Hay ${countOr(details.count, "demasiados")} mandamientos por generar y el máximo por descarga masiva es ${countOr(details.max, "10.000")}. Carga un Excel con menos predios para generarlos por partes.`,
};

function resolve(entry: CatalogEntry, details: ErrorDetails): string {
  return typeof entry === "function" ? entry(details) : entry;
}

// Text for an error code, or null if the code isn't in the catalog (the
// caller then falls back to a message based on the HTTP status).
export function messageForErrorCode(
  code: string,
  details: ErrorDetails = {},
  audience: MessageAudience = "admin",
  document: MessageDocument = "LIQUIDACION",
): string | null {
  const entry =
    (audience === "public" ? PUBLIC_OVERRIDES[code] : undefined) ??
    (document === "MANDAMIENTO" ? PAYMENT_ORDER_OVERRIDES[code] : undefined) ??
    ERROR_MESSAGES[code];
  return entry === undefined ? null : resolve(entry, details);
}

// Row-level problems reported by the tax roll import.

export interface RowIssue {
  row: number;
  code?: string;
  details?: ErrorDetails;
}

const ROW_ISSUE_MESSAGES: Record<string, CatalogEntry> = {
  MISSING_CADASTRAL_CODE: "Falta la cédula catastral.",
  INVALID_PERIOD: "El periodo está vacío o no es un año válido.",
  PERIOD_OUT_OF_RANGE: (details) =>
    `El periodo ${numberOr(details.period, "")} está fuera de rango: debe estar entre ${numberOr(details.min, "1980")} y ${numberOr(details.max, "el año actual")}.`,
  MISSING_OWNER_DOCUMENT: "Falta el documento del propietario (columna CCNIT).",
  NON_NUMERIC_VALUE: (details) => {
    const columns = stringList(details.columns);
    return columns.length > 0
      ? `Valor no numérico en ${columns.length > 1 ? "las columnas" : "la columna"} ${joinWithY(columns)}.`
      : "Hay un valor no numérico en una columna de montos.";
  },
  INVALID_COORDINATE: (details) => {
    const columns = stringList(details.columns);
    return columns.length > 0
      ? `Coordenada inválida en ${columns.length > 1 ? "las columnas" : "la columna"} ${joinWithY(columns)}.`
      : "Hay una coordenada inválida.";
  },
  DUPLICATE_KEY: (details) =>
    `La cédula catastral ${String(details.cadastralCode ?? "")} con el periodo ${numberOr(details.period, "")} está repetida: ya aparece en la fila ${numberOr(details.firstRow, "anterior")}.`,
  MISSING_OWNER: "Sin propietario: la fila se cargó con el propietario vacío.",
  UNRECOGNIZED_DOCUMENT_TYPE: (details) =>
    `No se reconoce el tipo de documento en CCNIT (${String(details.value ?? "")}): el propietario se guardó sin tipo de documento.`,
  UNRECOGNIZED_LAND_USE: (details) => {
    const value = String(details.value ?? "").trim();
    return value
      ? `Destino "${value}" no reconocido (se esperaba "rural" o "urbano"): la fila se cargó sin destino.`
      : "Destino vacío: la fila se cargó sin destino.";
  },
};

export function messageForRowIssue(issue: RowIssue): string {
  const entry = issue.code ? ROW_ISSUE_MESSAGES[issue.code] : undefined;
  const text =
    entry === undefined
      ? "La fila tiene datos no válidos."
      : resolve(entry, issue.details ?? {});
  return `Fila ${issue.row}: ${text}`;
}

// Why a period of the payment orders Excel can't get a payment order now
// (`reason` of the import preview and of `rejected` when generating).

// The 60 days are counted on Colombia's calendar.
const FIRM_DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "America/Bogota",
});

const PAYMENT_ORDER_REJECTION_MESSAGES: Record<string, string> = {
  SETTLEMENT_NOT_FOUND:
    "No hay una liquidación vigente para este predio y periodo.",
  SETTLEMENT_REPLACED:
    "La liquidación fue reemplazada por una carga posterior.",
  ALREADY_HAS_PAYMENT_ORDER: "Ya tiene mandamiento.",
  NO_RESOLUTION: "Todavía no se ha generado su resolución.",
  STATUS_NOT_ELIGIBLE:
    "Está pagada, en acuerdo de pago o en pérdida temporal de competencia.",
  NOT_YET_FIRM: "Todavía no está en firme.",
};

export function messageForPaymentOrderRejection(
  reason: string,
  firmOn?: string,
): string {
  if (reason === "NOT_YET_FIRM" && firmOn) {
    return `Queda en firme el ${FIRM_DATE_FORMATTER.format(new Date(firmOn))}.`;
  }
  return (
    PAYMENT_ORDER_REJECTION_MESSAGES[reason] ??
    "No cumple las condiciones para generar su mandamiento."
  );
}

// Generating one payment order when its periods stopped qualifying after the
// Excel was reviewed: none of them (nothing issued) or only some.
export const PAYMENT_ORDER_NOT_ISSUED_MESSAGE =
  "Este predio ya no cumple las condiciones para generar su mandamiento y no se generó. Revisa el motivo en No elegibles.";

export function paymentOrderLeftOutMessage(
  number: string,
  periods: number[],
): string {
  const leftOut =
    periods.length === 1
      ? `el periodo ${periods[0]}, que ya no cumplía`
      : `los periodos ${formatPeriods(periods)}, que ya no cumplían`;
  return `El mandamiento ${paymentOrderNumberLabel(number)} se generó sin ${leftOut} las condiciones.`;
}
