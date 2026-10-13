import { describe, expect, it } from "vitest";
import {
  EMBED_HEIGHT_PX,
  buildEmbedSnippet,
  consultationUrl,
} from "./embedSnippet";

const APP = "https://consulta.example.gov.co/";

describe("buildEmbedSnippet", () => {
  it("points the iframe at the municipality's own consultation", () => {
    expect(consultationUrl(APP, "paez")).toBe(
      "https://consulta.example.gov.co/#/consulta/paez",
    );
    expect(buildEmbedSnippet(APP, "paez", "Consulta")).toContain(
      'src="https://consulta.example.gov.co/#/consulta/paez"',
    );
  });

  it("has a fixed height, a title and no border", () => {
    const snippet = buildEmbedSnippet(APP, "paez", "Consulta");
    expect(snippet).toContain(`height="${EMBED_HEIGHT_PX}"`);
    expect(snippet).toContain('title="Consulta"');
    expect(snippet).toContain("border: 0");
    expect(snippet.startsWith("<iframe")).toBe(true);
    expect(snippet.endsWith("></iframe>")).toBe(true);
  });

  it("differs per municipality only in the slug", () => {
    const a = buildEmbedSnippet(APP, "paez", "T");
    const b = buildEmbedSnippet(APP, "paez-cauca", "T");
    expect(a).not.toBe(b);
    expect(a.replace("/consulta/paez", "/consulta/x")).toBe(
      b.replace("/consulta/paez-cauca", "/consulta/x"),
    );
  });

  it("escapes attribute values", () => {
    const snippet = buildEmbedSnippet(APP, "paez", 'A "B" <c> & d');
    expect(snippet).toContain('title="A &quot;B&quot; &lt;c&gt; &amp; d"');
  });
});
