<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Document templates (SL-91)

Each municipality has its own `.docx` templates, uploaded through
`POST /municipalities/:slug/templates` (multipart: `file` and `documentType`).
The upload is validated against the field catalog
(`src/templates/validate-template-fields.ts`): a valid template becomes the
active version automatically and the previous ones are kept
(`POST .../templates/:id/activate` brings one back); an invalid one is
rejected with the markers that are missing or unknown. PDF generation reads
the active template from the database and Blob, so changing a template does
not need a deploy. The files live in the `templates` container of Storage
(`AZURE_STORAGE_CONNECTION_STRING`), so Azurite must be running locally.

A municipality has no template until one is uploaded, and PDF generation
answers 503 `PDF_TEMPLATE_UNAVAILABLE` meanwhile. To install a municipality's
official template (client material, not in git) against a running backend,
with the email of an Administrator in `ADMIN_EMAIL` (required) and its password
in `ADMIN_PASSWORD`:

```bash
$ ADMIN_EMAIL=<email> pnpm --filter backend templates:upload <slug> LIQUIDACION <file.docx>
```

### Guided marking (SL-159)

A `.docx` without markers can be marked from the panel instead: `POST
.../templates/drafts` stores it as a draft (unactivated, 24 hours, under
`templates/<slug>/drafts/<id>/`), `GET .../drafts/:id/content` lists its
paragraphs, and `POST .../drafts/:id/preview` and `.../save` apply the
selected text as markers (`src/templates/guided-marking.ts`). Both also take
`removedRows`: table rows to leave out, each named by the `blockId` of one of
its paragraphs (the example values a table brings besides its example row);
a row with markers, or every row of a table, is refused. Save also takes an
optional `fileName`, the name the version is kept (and downloaded) under;
without it the uploaded file's name stays. Preview fills it
with fixed sample data through the PDF service; save validates it like an
upload and activates it. `DELETE .../drafts/:id` cancels one, and an hourly
sweep removes the expired ones. Routes, errors and sample data: Confluence page
"Contrato del marcado guiado de plantillas".

### Viewing a saved version (SL-183)

Any saved version, active or older (the `id` of `GET .../templates`), can be
looked at: `GET .../templates/:id/content` returns its paragraphs in the draft
format, with each `appliedMarkers` entry also carrying the catalog `label`;
`GET .../:id/preview` renders it to PDF with the same sample data as the draft
preview; and `GET .../:id/download` returns the stored `.docx` byte for byte,
under the name it was uploaded with. A template of another municipality
answers 404 `TEMPLATE_NOT_FOUND`, same as a missing one.

## Settlement status changes and Slompsim's tools (SL-154)

A status change applies to one settlement (a property and period), never to
the rest of its resolution, and is checked with
`src/settlements/settlement-status-rules.ts`. A settlement in no payment
order can become `PRESCRITA` at any time; one in a payment order, 5 years
after that payment order. Every change an Administrator makes is recorded in
`settlement_events` in the same transaction, with the previous and new
status, the source (`MANUAL` from `PATCH .../settlements/:id/status`,
`ASSISTANT` from a confirmed proposal), the optional note and the
Administrator. Rules and decisions: Confluence pages "Diseño de Slompsim"
(D3, D4, D5, D7) and "Slompsim: arquitectura y modelo".

The assistant's tools live in `src/assistant/assistant-tools.service.ts`.
They are internal services, not routes, and none of them writes:

- `searchSettlements`: by `cadastralCode` or by `settlementId`, exactly one
  of them, at most 50 results. Never by owner or address.
- `findUnlistedPeriods`: given the rows of the payment orders Excel (up to
  5000), the current settlements of each property in it whose period the
  file leaves out. `POST .../payment-orders/import` returns the same list as
  `unlisted`.
- `proposeStatusChange`: up to 100 changes, each `accepted` or `rejected`
  with `TRANSITION_NOT_ALLOWED`, `NOT_FOUND` (also for another
  municipality's settlement) or `REPLACED`, plus the allowed states, the
  current one and its payment order.

All three return only `id`, `cadastralCode`, `period`, `status`,
`allowedStatuses` and `hasPaymentOrder`: never names, documents or addresses.

The panel applies a proposal without going through the model:
`POST /municipalities/:slug/assistant/changes/preview` validates like
`proposeStatusChange`, and `POST .../assistant/changes/confirm` with
`{ changes, note? }` (note up to 500 characters) checks every change again
with the rows locked. It applies all of them or none: if one no longer
applies it answers 409 `ASSISTANT_CHANGES_REJECTED` with the rejected ones in
`details.rejected`. A settlement already in the requested state comes back
in `unchanged` and records nothing.

### Conversation with the model (SL-155)

`POST /municipalities/:slug/assistant/messages` with
`{ message, history?, context? }` answers `{ reply, proposals }`.

- **Request:**
  - `history` holds the last turns (at most 10, `{ role: "user" | "assistant", content }`). The client keeps it: the server stores no conversation.
  - `context.paymentOrderRows` can carry the rows of the payment orders Excel (up to 5000), which `find_unlisted_periods` uses. The model never copies them.
- **Response:** `proposals` is the last proposal of the message, already validated (`accepted`, `rejected`, optional `note`), or `null`. The panel applies it with `changes/confirm`.
- **Limits:** at most 5 tool calls and 30 seconds per message, and 20 messages per minute per Administrator.
- **Errors:**
  - 422 `ASSISTANT_TOO_MANY_TOOL_CALLS`;
  - 503 `ASSISTANT_UNAVAILABLE` (no model configured, the model failed or ran out of time; `details.reason` says which);
  - 429 `ASSISTANT_RATE_LIMITED`, with `Retry-After`.

The loop (`src/assistant/assistant-conversation.service.ts`) only knows the
interface in `src/assistant/model/assistant-model.ts`. The provider comes
from the environment (`apps/backend/.env.example`):

- `ASSISTANT_PROVIDER=anthropic` with `ASSISTANT_API_KEY` uses Claude.
  Optional: `ASSISTANT_MODEL` (default `claude-haiku-5-5`) and
  `ASSISTANT_EFFORT` (default `low`).
- `ASSISTANT_PROVIDER=fake` answers a fixed text without a key, to work on
  the panel.
- Unset, the assistant is off and only this route answers 503.

What reaches the model:

- the tools' output, which has no names, documents or addresses;
- the text the Administrator wrote, with every 6 to 10 digits after CC, CE,
  NIT, TI or PP replaced by `[DOC]` (`src/assistant/mask-documents.ts`). A
  name typed by hand can't be detected: the chat asks not to write any.

Each message writes one JSON log line (`"event":"assistant.message"`) with
the request id, provider and model, the tools called, the duration, the
result code and the token counts. It never includes the conversation's text
or the tools' arguments.

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
