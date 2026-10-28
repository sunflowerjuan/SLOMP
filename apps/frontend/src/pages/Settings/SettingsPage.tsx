import { Screen } from "../../components/ui/Screen";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { adminHref, settingsView } from "../../routes";
import type { SettingsTab } from "../../routes";
import { ActiveTemplates } from "../Templates/ActiveTemplates";
import { ConsultationLink } from "./ConsultationLink";
import "./SettingsPage.css";

const TAB_OPTIONS: { value: SettingsTab; label: string }[] = [
  { value: "plantillas", label: "Plantillas" },
  { value: "consulta", label: "Enlace de consulta" },
];

// Configuración (SL-170): a tab per thing to set up, each with its own
// address, so a saved link opens it. The tabs stay put above the content,
// which is all that scrolls. Plantillas only says which version of each
// document is in use; each document's templates have their own screen.
export function SettingsPage({
  slug,
  tab,
}: {
  slug: string;
  tab: SettingsTab;
}) {
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
        </div>
      }
    >
      {tab === "plantillas" ? (
        <ActiveTemplates slug={slug} />
      ) : (
        <ConsultationLink slug={slug} />
      )}
    </Screen>
  );
}
