// Single catalog of the texts the user sees for every backend error code.
// The backend only sends stable codes (see apps/backend/src/common/errors/
// error-codes.ts); the wording lives here so it can follow one style:
//   1. What happened, in plain words (no codes, ids or tool names).
//   2. What the user can do next, when there is something to do.
//   Informal "tú", full sentences ending in a period.

export type ErrorDetails = Record<string, unknown>;

// Who is reading the message: the Administrator (panel) or the taxpayer
// (public consultation), who cannot fix templates or data themselves.
export type MessageAudience = "admin" | "public";

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

function numberOr(value: unknown, fallback: string): string {
  return typeof value === "number" ? String(value) : fallback;
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
  TEMPLATE_FIELDS_INVALID: (details) => {
    const braces = (items: string[]) => items.map((item) => `{${item}}`);
    const missing = braces(stringList(details.missing));
    const unknown = braces(stringList(details.unknown));
    const parts = [
      missing.length > 0
        ? `le ${missing.length > 1 ? "faltan" : "falta"} ${joinWithY(missing)}`
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
    `Hay ${numberOr(details.count, "demasiadas")} liquidaciones pendientes y el máximo por descarga masiva es ${numberOr(details.max, "10000")}. Contacta al equipo de soporte para generarlas por partes.`,
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

function resolve(entry: CatalogEntry, details: ErrorDetails): string {
  return typeof entry === "function" ? entry(details) : entry;
}

// Text for an error code, or null if the code isn't in the catalog (the
// caller then falls back to a message based on the HTTP status).
export function messageForErrorCode(
  code: string,
  details: ErrorDetails = {},
  audience: MessageAudience = "admin",
): string | null {
  const entry =
    (audience === "public" ? PUBLIC_OVERRIDES[code] : undefined) ??
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
