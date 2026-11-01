import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";
import { apiFetch } from "../src/api";
import {
  assistantEventCount,
  makeSettlementsFirm,
  resetTaxRoll,
} from "../src/db";
import { baseUrl, E2E_MUNICIPALITY_SLUG } from "../src/env";
import {
  ensureActiveLiquidationTemplate,
  ensureActivePaymentOrderTemplate,
  fixture,
  issueResolutions,
  loadTaxRoll,
} from "../src/fixtures";
import { adminPath } from "../src/paths";
import { signIn } from "../src/session";

// SL-156: Slompsim in the panel. The stack runs with the assistant off, so
// the model's answers are simulated in the browser; what they propose is the
// real review of the backend, and applying it is the real confirm.

const CODES = [
  "999990001000000010001",
  "999990001000000020001",
  "999990002000010000001",
];
const MUNICIPALITY_PATH = `/municipalities/${E2E_MUNICIPALITY_SLUG}`;

test.beforeEach(async ({ page }) => {
  resetTaxRoll();
  await loadTaxRoll("cartera-valida.xlsx");
  await ensureActiveLiquidationTemplate();
  await ensureActivePaymentOrderTemplate();
  await issueResolutions(CODES);
  makeSettlementsFirm();
  await signIn(page);
  await page.goto(adminPath("mandamientos"));
  await expect(
    page.getByRole("heading", { level: 1, name: "Mandamientos" }),
  ).toBeVisible();
});

test.afterAll(() => {
  // The other files expect liquidations without a resolution.
  resetTaxRoll();
});

function chat(page: Page) {
  return page.getByRole("dialog", { name: "Slompsim" });
}

function field(page: Page) {
  return chat(page).getByLabel("Mensaje para Slompsim");
}

async function openChat(page: Page, isMobile: boolean) {
  await page
    .getByRole("button", {
      name: isMobile ? "Abrir Slompsim" : "Slompsim",
      exact: true,
    })
    .click();
  await expect(chat(page)).toBeVisible();
}

async function sendMessage(page: Page, text: string) {
  await field(page).fill(text);
  await chat(page).getByRole("button", { name: "Enviar" }).click();
}

async function settlementIdOf(code: string): Promise<number> {
  const found = await apiFetch(
    `${MUNICIPALITY_PATH}/settlements/search?cadastralCode=${code}`,
  );
  const [entry] = (await found.json()) as { settlementId: number }[];
  return entry.settlementId;
}

// The liquidation of a period left out of mandamientos-parcial.xlsx.
async function unlistedIdOf(code: string): Promise<number> {
  const found = await apiFetch(
    `${MUNICIPALITY_PATH}/settlements/search?cadastralCode=${code}`,
  );
  const [{ settlements }] = (await found.json()) as {
    settlements: { settlementId: number; period: number }[];
  }[];
  return settlements.find(({ period }) => period === 2025)!.settlementId;
}

async function changeStatus(settlementId: number, status: string) {
  await apiFetch(`${MUNICIPALITY_PATH}/settlements/${settlementId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

async function uploadPartialFile(page: Page) {
  await page
    .locator("input[type=file]")
    .setInputFiles(fixture("mandamientos-parcial.xlsx"));
  await page.getByRole("button", { name: "Revisar archivo" }).click();
}

interface StatusChange {
  settlementId: number;
  toStatus: string;
}

// What propose_status_change answers for these changes.
async function reviewAll(changes: StatusChange[]): Promise<unknown> {
  const reviewed = await apiFetch(
    `${MUNICIPALITY_PATH}/assistant/changes/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changes }),
    },
  );
  return reviewed.json();
}

function review(settlementId: number, toStatus: string): Promise<unknown> {
  return reviewAll([{ settlementId, toStatus }]);
}

// The model: every message gets this answer, and the requests are kept.
async function simulateModel(page: Page, answer: unknown) {
  const requests: Record<string, unknown>[] = [];
  await page.route("**/assistant/messages", async (route: Route) => {
    requests.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      json: answer,
      headers: {
        "access-control-allow-origin": baseUrl,
        "access-control-allow-credentials": "true",
      },
    });
  });
  return requests;
}

test("el botón está habilitado y, con el asistente apagado, el chat ofrece Reintentar sin afectar el panel @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  await expect(page.getByText("Próximamente")).toHaveCount(0);

  await openChat(page, isMobile);
  await expect(chat(page).getByText("¿Qué necesitas revisar?")).toBeVisible();
  await expect(field(page)).toBeFocused();

  // A suggestion only writes the sentence: its property is still missing.
  await chat(page)
    .getByRole("button", { name: "Muéstrame las liquidaciones de un predio" })
    .click();
  await expect(field(page)).toHaveValue(
    "Muéstrame las liquidaciones de un predio",
  );
  await expect(chat(page).getByText("¿Qué necesitas revisar?")).toBeVisible();

  await sendMessage(page, "¿Qué estados hay?");
  const failure = chat(page).getByText(
    "Slompsim no responde en este momento. Tus liquidaciones no cambiaron.",
  );
  await expect(failure).toBeVisible();
  await chat(page).getByRole("button", { name: "Reintentar" }).click();
  await expect(failure).toBeVisible();
  await expect(chat(page).getByText("¿Qué estados hay?")).toHaveCount(1);

  // A phone has no room for a second page: the width stays the screen's.
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await chat(page).getByRole("button", { name: "Cerrar Slompsim" }).click();
  await expect(chat(page)).toBeHidden();
  await page.locator("a[href$='/liquidaciones']").first().click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Liquidaciones" }),
  ).toBeVisible();

  // The conversation stays while moving between sections.
  await openChat(page, isMobile);
  await expect(failure).toBeVisible();
});

test("un Excel que deja periodos por fuera avisa y se resuelven en lote desde el chat, con auditoría @UAT-N/A", async ({
  page,
}) => {
  await uploadPartialFile(page);
  await expect(
    page.getByText("Hay 3 periodos liquidados que no aparecen en el Excel."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Revisar con Slompsim" }).click();
  await expect(chat(page).getByText("mandamientos-parcial.xlsx")).toBeVisible();
  await expect(chat(page).getByText("3 periodos de 3 predios")).toBeVisible();

  await chat(page)
    .getByRole("group", { name: "Estado para los periodos que faltan" })
    .getByRole("button", { name: "Pagada" })
    .click();

  await expect(
    chat(page).getByRole("heading", { name: "Pasar 3 periodos a Pagada" }),
  ).toBeVisible();
  const apply = chat(page).getByRole("button", { name: "Aplicar 3 cambios" });
  await expect(apply).toBeDisabled();
  await chat(page)
    .getByLabel("Entiendo que se cambiarán 3 liquidaciones")
    .check();
  await expect(apply).toBeEnabled();
  await apply.click();

  await expect(
    chat(page).getByRole("heading", { name: "Se aplicaron 3 cambios" }),
  ).toBeVisible();
  await expect(chat(page).getByText("3 predios, periodo 2025")).toBeVisible();
  expect(assistantEventCount()).toBe(3);

  // Answered: the notice is gone and the file asks nothing else.
  await expect(page.getByText("que no aparecen en el Excel.")).toHaveCount(0);
  await expect(
    chat(page).getByRole("group", {
      name: "Estado para los periodos que faltan",
    }),
  ).toHaveCount(0);

  // The notice that opened the chat went away: focus stays on the screen.
  await chat(page).getByRole("button", { name: "Cerrar Slompsim" }).click();
  await expect(page.locator("#main")).toBeFocused();
});

test("el aviso no cuenta lo que ya está pagado, pero sí un acuerdo de pago @UAT-N/A", async ({
  page,
}) => {
  await changeStatus(await unlistedIdOf(CODES[0]), "PAGADA");
  await changeStatus(await unlistedIdOf(CODES[1]), "ACUERDO_DE_PAGO");

  await uploadPartialFile(page);

  await expect(
    page.getByText("Hay 2 periodos liquidados que no aparecen en el Excel."),
  ).toBeVisible();
});

test("pedir un cambio en el chat muestra la propuesta y Aplicar lo cambia y lo audita @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  const settlementId = await settlementIdOf(CODES[0]);
  const requests = await simulateModel(page, {
    reply: "Este es el cambio. Revísalo antes de aplicarlo.",
    proposals: {
      ...(await review(settlementId, "PAGADA")),
      note: "Pagó en ventanilla",
    },
    settlements: null,
  });

  await openChat(page, isMobile);
  await sendMessage(page, `Marca como pagado el predio ${CODES[0]}`);

  const proposal = chat(page).getByRole("region", {
    name: "Propuesta de 1 cambio",
  });
  await expect(
    proposal.getByRole("heading", { name: /de En firme a Pagada$/ }),
  ).toBeVisible();
  await expect(proposal.getByText(CODES[0])).toBeVisible();
  await expect(proposal.getByText("Pagó en ventanilla")).toBeVisible();
  // Nothing changed yet.
  expect(assistantEventCount()).toBe(0);

  await proposal.getByRole("button", { name: "Aplicar", exact: true }).click();

  await expect(
    chat(page).getByRole("heading", { name: "Se aplicó 1 cambio" }),
  ).toBeVisible();
  expect(assistantEventCount()).toBe(1);

  await sendMessage(page, "Gracias");
  await expect(chat(page).getByText("Gracias")).toBeVisible();
  expect(requests[1].history).toEqual([
    { role: "user", content: `Marca como pagado el predio ${CODES[0]}` },
    {
      role: "assistant",
      content: "Este es el cambio. Revísalo antes de aplicarlo.",
    },
  ]);

  await chat(page)
    .getByRole("button", { name: "Ver en Liquidaciones" })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Liquidaciones" }),
  ).toBeVisible();
});

test("un rechazo explica la razón sin códigos y sus estados permitidos preparan el cambio @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  const settlementId = await settlementIdOf(CODES[0]);
  await simulateModel(page, {
    reply: "",
    proposals: await review(settlementId, "VIGENTE"),
    settlements: null,
  });

  await openChat(page, isMobile);
  await sendMessage(page, `Devuelve a vigente el predio ${CODES[0]}`);

  const rejection = chat(page).getByRole("alert");
  await expect(
    rejection.getByText("Una liquidación en firme no vuelve a Vigente."),
  ).toBeVisible();
  await expect(chat(page)).not.toContainText("TRANSITION_NOT_ALLOWED");
  await expect(chat(page)).not.toContainText("EN_FIRME");

  // The button goes straight to the backend, without the model.
  await rejection.getByRole("button", { name: "Pagada" }).click();
  await expect(
    chat(page).getByRole("region", { name: "Propuesta de 1 cambio" }),
  ).toBeVisible();
});

test("en un lote lo rechazado se lista aparte y solo se aplica lo aceptado @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  const [paid, ...kept] = await Promise.all(CODES.map(settlementIdOf));
  await simulateModel(page, {
    reply: "",
    proposals: await reviewAll([
      { settlementId: paid, toStatus: "PAGADA" },
      ...kept.map((settlementId) => ({ settlementId, toStatus: "VIGENTE" })),
    ]),
    settlements: null,
  });

  await openChat(page, isMobile);
  await sendMessage(page, "Cambia estos tres predios");

  await expect(
    chat(page)
      .getByRole("alert")
      .getByRole("heading", { name: "No se aplicarán 2 cambios" }),
  ).toBeVisible();
  await chat(page)
    .getByRole("region", { name: "Propuesta de 1 cambio" })
    .getByRole("button", { name: "Aplicar", exact: true })
    .click();

  await expect(
    chat(page).getByRole("heading", { name: "Se aplicó 1 cambio" }),
  ).toBeVisible();
  expect(assistantEventCount()).toBe(1);
});

test("si algo cambió antes de aplicar no se aplica nada y se puede revisar de nuevo @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  const settlementId = await settlementIdOf(CODES[0]);
  await simulateModel(page, {
    reply: "",
    proposals: await review(settlementId, "PRESCRITA"),
    settlements: null,
  });

  await openChat(page, isMobile);
  await sendMessage(page, `Pasa a pérdida temporal el predio ${CODES[0]}`);
  await expect(
    chat(page).getByRole("region", { name: "Propuesta de 1 cambio" }),
  ).toBeVisible();

  // Meanwhile it gets a payment order, which blocks that state for 5 years.
  const issued = await apiFetch(`${MUNICIPALITY_PATH}/payment-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ settlementIds: [settlementId] }),
  });
  expect(issued.ok).toBe(true);

  await chat(page)
    .getByRole("button", { name: "Aplicar", exact: true })
    .click();

  await expect(
    chat(page).getByRole("heading", {
      name: /^No se aplicó ningún cambio: 1 liquidación cambió/,
    }),
  ).toBeVisible();
  await expect(
    chat(page).getByText("Este periodo está en el mandamiento"),
  ).toBeVisible();
  expect(assistantEventCount()).toBe(0);

  await chat(page).getByRole("button", { name: "Revisar de nuevo" }).click();
  await expect(
    chat(page).getByRole("button", { name: "Pagada" }),
  ).toBeVisible();
});

test("el chat se maneja con teclado y devuelve el foco al cerrarse @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Los teclados táctiles no tienen Mayús + Enter.");
  await simulateModel(page, {
    reply: "Hay cinco estados.",
    proposals: null,
    settlements: null,
  });
  const opener = page.getByRole("button", { name: "Slompsim", exact: true });

  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(field(page)).toBeFocused();
  await expect(opener).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.type("Primera línea");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Segunda línea");
  await expect(field(page)).toHaveValue("Primera línea\nSegunda línea");
  await expect(chat(page).getByText("Enter envía")).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(chat(page).getByText("Hay cinco estados.")).toBeVisible();
  await expect(field(page)).toHaveValue("");

  await page.keyboard.press("Escape");
  await expect(chat(page)).toBeHidden();
  await expect(opener).toBeFocused();
});

test("nunca hay dos paneles a la derecha: abrir Slompsim cierra el detalle y viceversa @UAT-N/A", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "En un teléfono cada panel ocupa toda la pantalla.");
  await page.goto(adminPath("liquidaciones"));
  await page.getByRole("searchbox", { name: "Cédula" }).fill(CODES[0]);
  await page.getByRole("button", { name: "Buscar" }).click();
  const row = page.getByRole("row").filter({ hasText: CODES[0] });
  const sheet = page.getByRole("complementary", {
    name: "Detalle de la liquidación",
  });
  await row.click();
  await expect(sheet).toBeVisible();

  // Below 1440 px a scrim covers the screen: only the keyboard gets there.
  const opener = page.getByRole("button", { name: "Slompsim", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  await expect(chat(page)).toBeVisible();
  await expect(sheet).toBeHidden();

  // The screen behind stays usable: the sheet takes the chat's place.
  await row.click();
  await expect(sheet).toBeVisible();
  await expect(chat(page)).toBeHidden();
});
