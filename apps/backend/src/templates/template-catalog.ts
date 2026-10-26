import type { PdfDocumentType } from '@prisma/client';
import { CATALOGS, type FieldKind } from './validate-template-fields.js';

export interface CatalogEntry {
  key: string;
  label: string;
  description: string;
  required: boolean;
  kind: FieldKind;
}

// Scalars first, then each loop followed by its fields (only table loops
// publish them); required entries lead, each group keeping catalog order.
export function buildTemplateCatalog(type: PdfDocumentType): CatalogEntry[] {
  const catalog = CATALOGS[type];
  if (!catalog) {
    throw new Error(`There is no field catalog for ${type} templates yet.`);
  }
  const keys = [
    ...catalog.scalars,
    ...Object.entries(catalog.loops).flatMap(([loop, fields]) => [
      loop,
      ...(catalog.meta[loop]?.kind === 'TABLE_ROW'
        ? fields.map((field) => `${loop}.${field}`)
        : []),
    ]),
  ];
  const entries = keys.map((key) => {
    const meta = catalog.meta[key]!;
    return {
      key,
      label: meta.label,
      description: meta.description,
      required: catalog.required.includes(key) || meta.requiredInTable === true,
      kind: meta.kind,
    };
  });
  return [
    ...entries.filter((entry) => entry.required),
    ...entries.filter((entry) => !entry.required),
  ];
}
