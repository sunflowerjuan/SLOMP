import { useState } from "react";
import type { TemplateDocumentType } from "../../api/templates";
import { Screen } from "../../components/ui/Screen";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { adminHref, settingsView } from "../../routes";
import type { SettingsTab } from "../../routes";
import { DocumentTemplates } from "../Templates/DocumentTemplates";
import { ConsultationLink } from "./ConsultationLink";
import "./SettingsPage.css";

const TAB_OPTIONS: { value: SettingsTab; label: string }[] = [
  { value: "plantillas", label: "Plantillas" },
  { value: "consulta", label: "Enlace de consulta" },
];

const DOCUMENT_OPTIONS: { value: TemplateDocumentType; label: string }[] = [
  { value: "LIQUIDACION", label: "Liquidación" },
  { value: "MANDAMIENTO", label: "Mandamiento" },
];

// Configuración (SL-170): a tab per thing to set up, each with its own
// address, so a saved link opens it. The tabs and the document type of
// Plantillas stay put above the content, which is all that scrolls.
export function SettingsPage({
  slug,
  tab,
}: {
  slug: string;
  tab: SettingsTab;
}) {
  // Kept while moving between tabs; only a new municipality resets it.
  const [documentType, setDocumentType] =
    useState<TemplateDocumentType>("LIQUIDACION");

  return (
    <Screen
      className="settings-page"
      title="Configuración"
      input={
        <div className="settings-page__controls">
          <SegmentedControl
            label="Configuración"
            name="settings-tab"
            options={TAB_OPTIONS}
            value={tab}
            onChange={(next) => {
              window.location.hash = adminHref(slug, settingsView(next));
            }}
          />
          {tab === "plantillas" && (
            <SegmentedControl
              label="Tipo de documento"
              name="template-document-type"
              options={DOCUMENT_OPTIONS}
              value={documentType}
              onChange={setDocumentType}
            />
          )}
        </div>
      }
    >
      {tab === "plantillas" ? (
        // Switching type starts its panel afresh: nothing of the other type's
        // upload stays on screen.
        <DocumentTemplates key={documentType} documentType={documentType} />
      ) : (
        <ConsultationLink slug={slug} />
      )}
    </Screen>
  );
}
