// Static mockups of Slompsim (SL-153). One state per URL: index.html?state=...
// Markup reuses the real class names of the panel so the stills are drawn with
// its real CSS, imported below; only the chat panel is new (slompsim.css).
// All data is synthetic.

import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "../../src/styles/tokens.css";
import "../../src/index.css";
import "../../src/components/layout/AdminLayout.css";
import "../../src/components/layout/AuthLayout.css";
import "../../src/components/ui/Button.css";
import "../../src/components/ui/Card.css";
import "../../src/components/ui/Notice.css";
import "../../src/components/ui/StatusBadge.css";
import "../../src/components/ui/Screen.css";
import "../../src/components/ui/PageHeader.css";
import "../../src/components/ui/Dropzone.css";
import "../../src/components/ui/Input.css";
import "../../src/pages/TaxRollUpload/BulkZipPanel.css";
import "../../src/pages/TaxRollUpload/TaxRollStat.css";
import "../../src/pages/PaymentOrders/PaymentOrdersPage.css";
import "../../src/pages/PaymentOrders/PaymentOrderCandidateList.css";
import "./slompsim.css";

const state = new URLSearchParams(location.search).get("state") || "vacio";
const phone = matchMedia("(max-width: 900px)").matches;

const svg = (box, body) =>
  `<svg viewBox="0 0 ${box} ${box}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICON = {
  spark: svg(
    24,
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M18.5 16v4M16.5 18h4"/>',
  ),
  close: svg(24, '<path d="M6 6l12 12M18 6L6 18"/>'),
  send: svg(24, '<path d="M12 19V5M6 11l6-6 6 6"/>'),
  arrow: svg(16, '<path d="M3 8h10M9 4l4 4-4 4"/>'),
  check: svg(
    24,
    '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 10"/>',
  ),
  alert: svg(
    24,
    '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  ),
  file: svg(16, '<path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5v3h3"/>'),
  chevron: svg(16, '<path d="M4 6l4 4 4-4"/>'),
  upload: svg(24, '<path d="M12 16V4M8 8l4-4 4 4"/><path d="M4 20h16"/>'),
  doc: svg(
    24,
    '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  ),
  order: svg(
    24,
    '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h3"/><path d="M14.5 15.5l1.5 1.5 3-3"/>',
  ),
  template: svg(
    24,
    '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M10.5 11.5L9 13l1.5 1.5M13.5 11.5L15 13l-1.5 1.5"/>',
  ),
  code: svg(24, '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>'),
  signout: svg(24, '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>'),
  brand: svg(
    24,
    '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><circle cx="12" cy="14" r="2.6"/><path d="M10.6 16.4L10 20l2-1 2 1-.6-3.6"/>',
  ),
};

const BADGE = {
  VIGENTE: ["warning", "Vigente"],
  EN_FIRME: ["info", "En firme"],
  PAGADA: ["success", "Pagada"],
  ACUERDO_DE_PAGO: ["neutral", "Acuerdo de pago"],
  PRESCRITA: ["danger", "Pérdida temporal de competencia"],
};
const badge = (status) =>
  `<span class="ui-status-badge ui-status-badge--${BADGE[status][0]}">${BADGE[status][1]}</span>`;

const button = (
  label,
  { variant = "primary", disabled = false, loading = false, extra = "" } = {},
) =>
  `<button type="button" class="ui-button ui-button--${variant} ui-button--md${loading ? " ui-button--loading" : ""}" ${disabled || loading ? "disabled" : ""} ${loading ? 'aria-busy="true"' : ""} ${extra}>${loading ? '<span class="ui-button__spinner" aria-hidden="true"></span>' : ""}<span class="ui-button__label">${label}</span></button>`;

const chatOpen = !["cerrado", "entrada-aviso", "sesion"].includes(state);

// ---------------------------------------------------------------- layout

function sidebar() {
  const nav = [
    ["cargas", "Carga de Excel", ICON.upload, false],
    ["liquidaciones", "Liquidaciones", ICON.doc, false],
    ["mandamientos", "Mandamientos", ICON.order, true],
    ["plantillas", "Plantillas", ICON.template, false, true],
    ["consulta", "Consulta pública", ICON.code, false, true],
  ].filter((item) => !(phone && item[4]));
  const links = nav
    .map(
      ([id, label, icon, active]) =>
        `<a class="admin-layout__link" href="#/${id}" data-slide-item ${active ? 'aria-current="page"' : ""}>${icon}<span>${label}</span></a>`,
    )
    .join("");
  const brand = `<span class="admin-layout__mark" aria-hidden="true">${ICON.brand}</span><span class="admin-layout__brand-text"><span class="admin-layout__brand">SLOMP</span>${phone ? '<span class="admin-layout__brand-context">Páez</span>' : ""}</span>`;
  return `
  <aside class="admin-layout__side" ${phone ? "" : "data-switcher"}>
    <div class="admin-layout__brandbar">
      ${phone ? `<button type="button" class="admin-layout__brand-button" aria-label="Menú. Municipio: Páez">${brand}</button>` : `<div class="admin-layout__brand-button">${brand}</div>`}
    </div>
    ${phone ? "" : `<div class="admin-layout__switcher"><button type="button" class="admin-layout__switcher-button" aria-haspopup="listbox"><span class="admin-layout__switcher-label">Páez</span>${ICON.chevron}</button></div>`}
    <nav class="admin-layout__nav" aria-label="Panel Administrador"><span class="admin-layout__indicator" aria-hidden="true"></span>${links}</nav>
    ${
      phone
        ? ""
        : `<div class="sl-entry-separator" role="separator"></div>
    <button type="button" class="admin-layout__menu-item sl-entry" aria-expanded="${chatOpen}" aria-controls="slompsim">${ICON.spark}Slompsim</button>
    <div class="admin-layout__actions"><button type="button" class="admin-layout__menu-item">${ICON.signout}Cerrar sesión</button></div>`
    }
  </aside>`;
}

const UNLISTED_NOTICE = `
  <div class="ui-notice ui-notice--info sl-unlisted" role="status">
    <div class="sl-notice-row">
      <span><strong class="sl-num">Hay 7 periodos liquidados que no aparecen en el Excel.</strong> Pertenecen a 3 predios que sí tienen mandamiento en este archivo.</span>
      ${button("Revisar con Slompsim", { variant: "secondary" })}
    </div>
  </div>`;

function mandamientosPage({ withNotice }) {
  const head = `<div class="ui-screen__head"><header class="ui-page-header"><h1 class="ui-page-header__title">Mandamientos</h1></header>${
    phone
      ? `<button type="button" class="ui-button ui-button--secondary ui-button--md sl-head-button" aria-label="Abrir Slompsim" aria-expanded="false"><span class="ui-button__label">${ICON.spark}</span></button>`
      : ""
  }</div>`;
  const upload = `
    <div class="payment-orders-page__upload">
      <div class="ui-dropzone ui-dropzone--uploaded"><div class="ui-dropzone__file"><span class="ui-dropzone__file-name">mandamientos-octubre.xlsx</span><span class="ui-dropzone__file-size">84 KB</span><button type="button" class="ui-dropzone__remove">Quitar</button></div></div>
      <div class="payment-orders-page__actions">${button("Procesar archivo")}</div>
    </div>`;
  const zip = `
    <section class="ui-card payment-order-zip-panel"><div class="ui-card__header"><div class="ui-card__heading"><h2 class="ui-card__title">Generación masiva</h2></div></div>
      <div class="bulk-zip-panel__rows"><div class="bulk-zip-panel__row"><div><strong>Mandamientos en firme</strong><span>3 por generar</span></div>${button("Generar ZIP")}</div></div>
    </section>`;
  const candidates = [
    ["010000040021000", "2016 a 2019"],
    ["010000040022000", "2018 a 2020"],
    ["020000110007000", "2015 a 2017"],
  ]
    .map(
      ([code, periods]) =>
        `<li><div class="payment-order-candidates__row"><div class="payment-order-candidates__info"><span class="payment-order-candidates__code">${code}</span><span>${periods}</span></div><div class="payment-order-candidates__actions"><span class="ui-status-badge ui-status-badge--info">Listo para generar</span>${button("Generar", { variant: "secondary" })}</div></div></li>`,
    )
    .join("");
  const stat = (value, label) =>
    `<div class="tax-roll-upload-page__stat"><dt>${label}</dt><dd>${value}</dd></div>`;
  const result = `
    <div class="payment-orders-page__result" role="region" aria-label="Resultado de la carga" tabindex="-1">
      <section class="ui-card"><div class="ui-card__header"><div class="ui-card__heading"><h2 class="ui-card__title">Resultado de la carga</h2></div><p class="ui-card__subtitle">mandamientos-octubre.xlsx</p></div>
        <dl class="payment-orders-page__stats">${stat(3, "mandamientos por generar")}${stat(10, "periodos en firme")}${stat(0, "periodos no elegibles")}${stat(0, "filas inválidas omitidas")}${stat(0, "con advertencias")}</dl>
        <h3 class="payment-orders-page__subheading">Listos para generar</h3>
        <ul class="payment-order-candidates" aria-label="Listos para generar">${candidates}</ul>
      </section>
    </div>`;
  return `
  <div class="page ui-screen payment-orders-page"><div class="ui-screen__zones">
    ${head}
    <div class="ui-screen__input-row">${upload}${phone ? "" : zip}</div>
    <div class="ui-screen__body">${withNotice ? UNLISTED_NOTICE : ""}${result}</div>
  </div></div>`;
}

// ---------------------------------------------------------------- chat parts

const user = (text) => `<p class="sl-msg sl-msg--user">${text}</p>`;
const assistant = (html) =>
  `<div class="sl-msg sl-msg--assistant">${html}</div>`;

const A = "010000040021000";
const B = "010000040022000";
const C = "020000110007000";

function rows(header, list, cls = "") {
  return `<ul class="sl-rows ${cls}"><li aria-hidden="true"><span>${header[0]}</span><span>${header[1]}</span><span>${header[2]}</span></li>${list
    .map(
      (r) =>
        `<li><span class="sl-code">${r[0]}</span><span class="sl-num">${r[1]}</span>${r[2]}</li>`,
    )
    .join("")}</ul>`;
}

const BATCH = [
  [A, 2016],
  [A, 2017],
  [A, 2018],
  [A, 2019],
  [A, 2020],
  [A, 2021],
  [C, 2016],
  [C, 2017],
  [C, 2018],
  [C, 2019],
  [C, 2020],
  [C, 2021],
];
const BATCH_REQUEST = `Marca como pagados los periodos 2016 a 2021 de los predios ${A} y ${C}`;

function batchCard({ checked = false, applying = false } = {}) {
  const shown = BATCH.slice(0, 10).map(([code, period]) => [
    code,
    period,
    badge("EN_FIRME"),
  ]);
  return `
  <section class="sl-card sl-card--proposal" aria-label="Propuesta de 12 cambios">
    <p class="sl-card__eyebrow">Cambio de estado · 12 liquidaciones</p>
    <h3 class="sl-card__title">Pasar 12 periodos a Pagada</h3>
    ${rows(["Predio", "Periodo", "Estado actual"], shown)}
    <p class="sl-rows__more">y 2 más</p>
    <label class="sl-check"><input type="checkbox" ${checked ? "checked" : ""} ${applying ? "disabled" : ""}/>Entiendo que se cambiarán 12 liquidaciones</label>
    <div class="sl-card__actions">
      ${button(applying ? "Aplicando 12 cambios" : "Aplicar 12 cambios", { disabled: !checked, loading: applying })}
      ${button("Descartar", { variant: "secondary", disabled: applying })}
    </div>
    <p class="sl-card__hint">Nada cambia hasta que pulses Aplicar.</p>
  </section>`;
}

const singleCard = `
  <section class="sl-card sl-card--proposal" aria-label="Propuesta de 1 cambio">
    <p class="sl-card__eyebrow">Cambio de estado · 1 liquidación</p>
    <h3 class="sl-card__title">Pasar la liquidación 2020 de En firme a Pagada</h3>
    <div class="sl-transition">${badge("EN_FIRME")}${ICON.arrow}<span class="sr-only"> a </span>${badge("PAGADA")}</div>
    <dl class="sl-facts">
      <dt>Predio</dt><dd class="sl-code">${A}</dd>
      <dt>Resolución</dt><dd class="sl-num">LOIP 155142026-0003</dd>
      <dt>Nota</dt><dd>Pagó en ventanilla el 20 de octubre</dd>
    </dl>
    <div class="sl-card__actions">${button("Aplicar")}${button("Descartar", { variant: "secondary" })}</div>
    <p class="sl-card__hint">Nada cambia hasta que pulses Aplicar.</p>
  </section>`;

const doneCard = `
  <section class="sl-card sl-card--done" role="status">
    <h3 class="sl-card__title">${ICON.check}Se aplicaron 12 cambios</h3>
    <p class="sl-card__text">2 predios, periodos 2016 a 2021. Ahora están en <strong>Pagada</strong>.</p>
    <p class="sl-card__text">Quedaron registrados a tu nombre el 25/10/2026 a las 10:42.</p>
    <div class="sl-card__actions">${button("Ver en Liquidaciones", { variant: "secondary" })}</div>
  </section>`;

const rejectedCard = `
  <section class="sl-card sl-card--rejected" role="alert">
    <h3 class="sl-card__title">${ICON.alert}No se puede pasar la liquidación 2019 a Pérdida temporal de competencia</h3>
    <p class="sl-card__text">Este periodo está en el mandamiento <span style="white-space: nowrap">MP-2026-0004</span> del 20/10/2026. Un periodo con mandamiento solo puede pasar a ese estado cuando se cumplan 5 años desde el mandamiento, es decir, desde el 20/10/2031.</p>
    <p class="sl-card__text"><strong>Puede pasar a:</strong></p>
    <div class="sl-card__actions sl-card__actions--states">${button("Pagada", { variant: "secondary" })}${button("Acuerdo de pago", { variant: "secondary" })}</div>
    <p class="sl-card__hint">Elige uno para preparar el cambio. Nada cambió.</p>
  </section>`;

const welcome = `
  <div class="sl-welcome">
    <h3 class="sl-welcome__title">¿Qué necesitas revisar?</h3>
    <p class="sl-welcome__text">Busco liquidaciones, te explico las reglas de los estados y preparo cambios de estado. Nada cambia hasta que tú lo apliques.</p>
    <ul class="sl-suggestions" aria-label="Sugerencias">
      <li><button type="button" class="sl-suggestion">Muéstrame las liquidaciones de un predio</button></li>
      <li><button type="button" class="sl-suggestion">¿A qué estados puede pasar una liquidación en firme?</button></li>
      <li><button type="button" class="sl-suggestion">Marca como pagado un periodo de un predio</button></li>
    </ul>
  </div>`;

const searchAnswer = assistant(`
  <p>El predio <span class="sl-code">${A}</span> tiene 7 liquidaciones:</p>
  ${rows(
    ["Resolución", "Periodo", "Estado"],
    [
      ["LOIP 155142026-0003", 2016, badge("EN_FIRME")],
      ["LOIP 155142026-0003", 2017, badge("EN_FIRME")],
      ["LOIP 155142026-0003", 2018, badge("EN_FIRME")],
      ["LOIP 155142026-0003", 2019, badge("EN_FIRME")],
      ["LOIP 155142026-0003", 2020, badge("EN_FIRME")],
      ["LOIP 155142026-0003", 2021, badge("PAGADA")],
      ["LOIP 155142026-0011", 2022, badge("VIGENTE")],
    ],
  )}
  <p>Las que están en firme pueden pasar a Pagada o a Acuerdo de pago.</p>`);

const SEARCH_REQUEST = `Muéstrame las liquidaciones del predio ${A}`;
const SINGLE_REQUEST = `Marca como pagado el 2020 del predio ${A}. Nota: pagó en ventanilla el 20 de octubre`;
const REJECTED_REQUEST = `Pasa el 2019 del predio ${A} a pérdida temporal de competencia`;
const FOLLOW_UP_REQUEST = `¿Y el predio ${C}?`;

function conversation() {
  switch (state) {
    case "vacio":
      return welcome;
    case "escribiendo":
      return welcome;
    case "esperando":
      return `${user(SEARCH_REQUEST)}
        <div class="sl-msg sl-msg--assistant sl-thinking" aria-busy="true"><span class="sl-skeleton" style="width: 92%"></span><span class="sl-skeleton" style="width: 74%"></span><span class="sl-skeleton" style="width: 55%"></span><p class="sl-thinking__label">Buscando las liquidaciones…</p></div>`;
    case "respuesta":
      return `${user(SEARCH_REQUEST)}${searchAnswer}`;
    case "nivel2":
      return `${user(SEARCH_REQUEST)}${searchAnswer}${user(SINGLE_REQUEST)}${assistant("<p>Este es el cambio. Revísalo antes de aplicarlo:</p>")}${singleCard}`;
    case "nivel3":
      return `${user(BATCH_REQUEST)}${batchCard()}`;
    case "aplicando":
      return `${user(BATCH_REQUEST)}${batchCard({ checked: true, applying: true })}`;
    case "aplicado":
      return `${user(BATCH_REQUEST)}${doneCard}`;
    case "rechazado":
      return `${user(REJECTED_REQUEST)}${rejectedCard}`;
    case "error":
      return `${user(SEARCH_REQUEST)}${searchAnswer}${user(FOLLOW_UP_REQUEST)}
        <div class="ui-notice ui-notice--error" role="alert"><div class="sl-notice-row"><span>Slompsim no responde en este momento. Tus liquidaciones no cambiaron.</span>${button("Reintentar", { variant: "secondary" })}</div></div>`;
    case "entrada-chat":
      return `
        <p class="sl-context">${ICON.file}<span>Revisando <strong>mandamientos-octubre.xlsx</strong></span></p>
        ${assistant(`
          <p>En el Excel faltan <strong>7 periodos de 3 predios</strong> que sí tienen mandamiento en este archivo. Que no aparezcan no quiere decir que estén pagados.</p>
          ${rows(
            ["Predio", "Periodos", "Estado"],
            [
              [A, "2020 y 2021", badge("EN_FIRME")],
              [B, "2021", badge("EN_FIRME")],
              [C, "2018 a 2021", badge("EN_FIRME")],
            ],
            "sl-rows--wide-mid",
          )}
          <p>Como no están en ningún mandamiento, pueden pasar ya a pérdida temporal de competencia. ¿A qué estado los paso?</p>`)}
        <div class="sl-card__actions sl-card__actions--states" role="group" aria-label="Estado para los periodos que faltan">
          ${button("Pérdida temporal de competencia", { variant: "secondary" })}${button("Pagada", { variant: "secondary" })}${button("Acuerdo de pago", { variant: "secondary" })}
        </div>
        <p class="sl-card__hint">También puedes escribir un estado distinto para cada predio, o dejarlos como están.</p>`;
    default:
      return "";
  }
}

function composer() {
  const disabled = state === "aplicando";
  const typing = state === "escribiendo";
  let text = "Escribe qué necesitas…";
  if (typing) {
    text = `${SEARCH_REQUEST}<span aria-hidden="true" style="border-left: 1.5px solid var(--semantic-text); margin-left: 1px"></span>`;
  } else if (disabled) {
    text = "Espera a que se apliquen los cambios…";
  }
  return `
  <form class="sl-chat__composer" onsubmit="return false">
    <div class="sl-field" ${typing ? "data-focused" : ""} ${disabled ? "data-disabled" : ""}>
      <p class="sl-field__input" ${typing ? "" : "data-placeholder"} role="textbox" aria-multiline="true" aria-label="Mensaje para Slompsim">${text}</p>
      <button type="submit" class="sl-send" aria-label="Enviar" ${typing ? "" : "disabled"}>${ICON.send}</button>
    </div>
    <p class="sl-chat__foot"><span>No escribas nombres ni documentos de personas.</span>${typing && !phone ? "<span>Enter envía · Mayús + Enter, nueva línea</span>" : ""}</p>
  </form>`;
}

function chat() {
  const empty = state === "vacio" || state === "escribiendo";
  return `
  <section id="slompsim" class="sl-chat" role="dialog" aria-modal="false" aria-labelledby="sl-title">
    <header class="sl-chat__header">
      <span class="sl-chat__mark" aria-hidden="true">${ICON.spark}</span>
      <div class="sl-chat__heading"><h2 id="sl-title" class="sl-chat__title">Slompsim</h2><p class="sl-chat__context">Páez</p></div>
      ${empty ? "" : '<button type="button" class="sl-text-button">Nueva conversación</button>'}
      <button type="button" class="sl-icon-button" aria-label="Cerrar Slompsim">${ICON.close}</button>
    </header>
    <div class="sl-chat__log" role="log" aria-live="polite" aria-label="Conversación con Slompsim">${conversation()}</div>
    ${composer()}
  </section>`;
}

function loginPage() {
  return `
  <div class="auth-layout">
    <aside class="auth-layout__institutional"><div class="auth-layout__grid" aria-hidden="true"></div><div class="auth-layout__brand"><span class="auth-layout__brand-tag">SLOMP</span><span class="auth-layout__brand-name">Tributaria Predial</span></div></aside>
    <main class="auth-layout__content"><div class="auth-layout__card">
      <h1 class="auth-layout__title">Ingresar</h1>
      <form class="auth-layout__form" onsubmit="return false">
        <div class="ui-notice ui-notice--info" role="status">Tu sesión expiró. Vuelve a iniciar sesión para continuar. La conversación con Slompsim no se guarda y los cambios que no aplicaste no se hicieron.</div>
        <div class="ui-input-group"><label class="ui-input-label">Correo electrónico</label><div class="ui-input-wrapper"><input class="ui-input" type="email" /></div></div>
        <div class="ui-input-group"><label class="ui-input-label">Contraseña</label><div class="ui-input-wrapper"><input class="ui-input ui-input--with-toggle" type="password" /><button type="button" class="ui-input-toggle">Mostrar</button></div></div>
        <button type="submit" class="ui-button ui-button--primary ui-button--lg ui-button--full-width"><span class="ui-button__label">Ingresar</span></button>
      </form>
      <p class="auth-layout__footer">¿Eres contribuyente? <a href="#">Consulta tus liquidaciones sin iniciar sesión</a></p>
    </div></main>
  </div>`;
}

// ---------------------------------------------------------------- render

const root = document.getElementById("root");
if (state === "sesion") {
  root.innerHTML = loginPage();
} else {
  root.innerHTML = `
  <div class="admin-layout">
    ${sidebar()}
    <main class="admin-layout__main" tabindex="-1">${mandamientosPage({ withNotice: state === "entrada-aviso" || state === "entrada-chat" })}</main>
  </div>
  ${chatOpen ? chat() : ""}`;
}

// Like a real chat, the log shows the newest content; the first screens of a
// conversation start at the top.
const log = document.querySelector(".sl-chat__log");
if (log && !["vacio", "escribiendo", "entrada-chat"].includes(state)) {
  log.scrollTop = log.scrollHeight;
}

// The sliding pill sits under the active section, as useSlidingIndicator does.
const active = document.querySelector(".admin-layout__link[aria-current]");
const pill = document.querySelector(".admin-layout__indicator");
if (active && pill) {
  pill.style.width = `${active.offsetWidth}px`;
  pill.style.height = `${active.offsetHeight}px`;
  pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
}
