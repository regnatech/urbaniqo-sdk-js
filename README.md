# Urbaniqo Transit SDK · JavaScript / Node

Official JS / TypeScript client for **Urbaniqo Transit** — the channel that lets your customers buy your tickets, passes and subscriptions through the Urbaniqo app.

> Looking for the PHP SDK? It lives in a separate repository: [`regnatech/urbaniqo-sdk-php`](https://github.com/regnatech/urbaniqo-sdk-php).

| Package | Manager | Status |
|---|---|---|
| `urbaniqo-sdk-js` | npm · Node ≥ 18 | v1 |

Wire-level spec for both SDKs: [`docs/protocol.md`](./docs/protocol.md).

## Install

```bash
npm install urbaniqo-sdk-js
```

No HTTP-client dependency: uses the global `fetch` available on Node 18+ (or pass your own).

## Quick start

```ts
import { UrbaniqoClient } from "urbaniqo-sdk-js";

const urbaniqo = new UrbaniqoClient({
    agencyId: process.env.URBANIQO_AGENCY_ID!,
    keyId:    process.env.URBANIQO_KEY_ID!,
    secret:   process.env.URBANIQO_SECRET!,
    // baseUrl defaults to https://urbaniqo.com/api/transit/v1
});

await urbaniqo.upsertTariffs([
    {
        id: "AMT-110",
        name: { en: "Single ride 110'", it: "Corsa singola 110 minuti" },
        kind: "single_ride",
        fare_cents: 200,
        currency: "EUR",
        default_validity_seconds: 110 * 60,
        is_active: true,
    },
]);
```

## What the SDK gives you

- HMAC-SHA256 request signing (Authorization header in canonical-request form)
- Idempotent retries with exponential backoff for safe verbs (PUT, GET, idempotent POSTs)
- `verifyWebhook()` for inbound webhook signature checking — pass the **raw** request body
- `createWebhookDispatcher()` for type-safe per-event handlers
- Typed errors: `UrbaniqoApiError`, `UrbaniqoTransportError`, `UrbaniqoWebhookError`

## Webhook handler (Express example)

A complete drop-in lives at [`examples/node-express-webhook/`](./examples/node-express-webhook/). See [`examples/mock-urbaniqo-server/`](./examples/mock-urbaniqo-server/) for a local Urbaniqo stand-in to test against without hitting production.

## Docs

- [`docs/protocol.md`](./docs/protocol.md) — wire-level spec
- [`docs/getting-started.md`](./docs/getting-started.md) — onboarding walkthrough
- [`docs/webhooks.md`](./docs/webhooks.md) — webhook events + payload shapes
- [`docs/error-codes.md`](./docs/error-codes.md) — full error code reference
- [`docs/barcode-formats.md`](./docs/barcode-formats.md) — supported ticket formats
- [`docs/changelog.md`](./docs/changelog.md)

## Build & test

```bash
npm install
npm run build   # tsc → dist/
npm test        # vitest
```

## License

MIT — see [`LICENSE`](./LICENSE).
