import { publicConsultationHref } from "../routes";

// Fixed height of the iframe handed to each municipality. The page scrolls
// inside it, so the municipality's site never needs to resize the frame.
export const EMBED_HEIGHT_PX = 720;

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// `appUrl`: where the frontend is served (no hash), e.g.
// "https://consulta.example.gov.co/".
export function consultationUrl(appUrl: string, slug: string): string {
  return `${appUrl}${publicConsultationHref(slug)}`;
}

// The <iframe> a municipality pastes into its own site.
export function buildEmbedSnippet(
  appUrl: string,
  slug: string,
  title: string,
): string {
  return [
    "<iframe",
    `  src="${escapeAttribute(consultationUrl(appUrl, slug))}"`,
    `  title="${escapeAttribute(title)}"`,
    '  width="100%"',
    `  height="${EMBED_HEIGHT_PX}"`,
    '  style="border: 0; max-width: 1040px"',
    '  loading="lazy"',
    "></iframe>",
  ].join("\n");
}
