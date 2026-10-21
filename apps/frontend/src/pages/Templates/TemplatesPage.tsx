import { useState } from "react";
import type { TemplateDocumentType } from "../../api/templates";
import { Screen } from "../../components/ui/Screen";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { DocumentTemplates } from "./DocumentTemplates";
import "./TemplatesPage.css";

const DOCUMENT_OPTIONS: { value: TemplateDocumentType; label: string }[] = [
  { value: "LIQUIDACION", label: "Liquidación" },
  { value: "MANDAMIENTO", label: "Mandamiento de pago" },
];

// One template per document type and municipality. Switching type starts its
// panel afresh: nothing of the other type's upload stays on screen.
export function TemplatesPage() {
  const [documentType, setDocumentType] =
    useState<TemplateDocumentType>("LIQUIDACION");

  return (
    <Screen
      className="templates-page"
      title="Plantillas"
      input={
        // The wrapper keeps the control at its own width in the page column.
        <div>
          <SegmentedControl
            label="Tipo de documento"
            name="template-document-type"
            options={DOCUMENT_OPTIONS}
            value={documentType}
            onChange={setDocumentType}
          />
        </div>
      }
    >
      <DocumentTemplates key={documentType} documentType={documentType} />
    </Screen>
  );
}
