import { publicConsultationHref } from "../routes";

// `appUrl`: where the frontend is served (no hash), e.g.
// "https://consulta.example.gov.co/".
export function consultationUrl(appUrl: string, slug: string): string {
  return `${appUrl}${publicConsultationHref(slug)}`;
}
