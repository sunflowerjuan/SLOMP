import type {
  DocumentBlock,
  TemplateDocumentType,
  TemplateVersion,
} from "../../api/templates";
import type { TemplatesSegment } from "../../routes";

// How the templates screens name each document type.
export const DOCUMENT_TEXT: Record<
  TemplateDocumentType,
  { title: string; name: string }
> = {
  LIQUIDACION: { title: "Liquidación oficial", name: "liquidación" },
  MANDAMIENTO: { title: "Mandamiento", name: "mandamiento" },
};

export const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

export const PART_LABEL: Record<DocumentBlock["part"], string> = {
  header: "Encabezado",
  body: "Cuerpo del documento",
  footer: "Pie de página",
};

// "Guardada el 30/10/26, 10:00 a. m. por Ana Ruiz".
export function savedText({
  createdAt,
  savedBy,
}: Pick<TemplateVersion, "createdAt" | "savedBy">): string {
  const date = DATE_TIME_FORMATTER.format(new Date(createdAt));
  return savedBy ? `Guardada el ${date} por ${savedBy}` : `Guardada el ${date}`;
}

// The document of each templates screen address, and back.
export const SEGMENT_TYPE: Record<TemplatesSegment, TemplateDocumentType> = {
  liquidacion: "LIQUIDACION",
  mandamiento: "MANDAMIENTO",
};

export const TYPE_SEGMENT: Record<TemplateDocumentType, TemplatesSegment> = {
  LIQUIDACION: "liquidacion",
  MANDAMIENTO: "mandamiento",
};
