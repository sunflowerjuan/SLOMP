import type { TemplateDocumentType } from "../../api/templates";
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

// The document of each templates screen address, and back.
export const SEGMENT_TYPE: Record<TemplatesSegment, TemplateDocumentType> = {
  liquidacion: "LIQUIDACION",
  mandamiento: "MANDAMIENTO",
};

export const TYPE_SEGMENT: Record<TemplateDocumentType, TemplatesSegment> = {
  LIQUIDACION: "liquidacion",
  MANDAMIENTO: "mandamiento",
};
