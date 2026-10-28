import { Screen } from "../../components/ui/Screen";
import { ActiveTemplates } from "../Templates/ActiveTemplates";
import { ConsultationLink } from "./ConsultationLink";
import "./SettingsPage.css";

// Configuración: one panel with what is set up for the municipality. The
// templates only say which version of each document is in use (their history
// and uploads have their own screen); the public consultation link can be
// copied or opened from here.
export function SettingsPage({ slug }: { slug: string }) {
  return (
    <Screen className="settings-page" title="Configuración">
      <div className="settings-page__panel">
        <ActiveTemplates slug={slug} />
        <ConsultationLink slug={slug} />
      </div>
    </Screen>
  );
}
