# Getting started

This is the 10-minute integration guide. Follow it end-to-end and your agency will be selling tickets through Urbaniqo.

## Prerequisites

- A registered transport agency on Urbaniqo (apply via the [agency dashboard](https://urbaniqo.com/transit/apply) — admin approves manually for v1).
- A backend that can receive HTTP POSTs from the public internet (or a tunnel like ngrok during development).
- Node.js ≥ 18 **or** PHP ≥ 8.2.

## Step 1 — Get your API key

In the Urbaniqo agency dashboard:

1. Go to **API & Webhooks** → **API keys**.
2. Click **Create key**, give it a name (e.g. `production-2026`).
3. Copy the `agency_id`, `key_id` and `secret` values **immediately** — the secret is shown once and never again.
4. In the same screen, set your **Webhook URL** (where Urbaniqo will POST events) and click **Generate webhook secret**. Copy that too.

Both secrets are 64 hex characters. Treat them like database passwords.

## Step 2 — Install the SDK

### Node.js

```bash
npm install urbaniqo-sdk-js
```

```ts
import { UrbaniqoClient, verifyWebhook } from "urbaniqo-sdk-js";

const urbaniqo = new UrbaniqoClient({
    agencyId: process.env.URBANIQO_AGENCY_ID!,
    keyId:    process.env.URBANIQO_KEY_ID!,
    secret:   process.env.URBANIQO_SECRET!,
});
```

### PHP

```bash
composer require regna/urbaniqo-sdk guzzlehttp/guzzle
```

```php
use Regna\UrbaniqoSdk\Client;
use GuzzleHttp\Client as Guzzle;
use GuzzleHttp\Psr7\HttpFactory;

$urbaniqo = new Client(
    agencyId:       getenv('URBANIQO_AGENCY_ID'),
    keyId:          getenv('URBANIQO_KEY_ID'),
    secret:         getenv('URBANIQO_SECRET'),
    httpClient:     new Guzzle(),
    requestFactory: new HttpFactory(),
    streamFactory:  new HttpFactory(),
);
```

## Step 3 — Publish your catalog

The catalog is the list of tariffs Urbaniqo can sell on your behalf. The SDK call is idempotent — call it whenever your tariffs change.

```ts
await urbaniqo.upsertTariffs([
    {
        id: "atm-urban-90",                                 // your own ID, stable
        name: { en: "Urban 90′", it: "Urbano 90′" },
        kind: "single_ride",
        fare_cents: 220,                                    // €2.20
        currency: "EUR",
        zones: ["Mi1", "Mi3"],
        default_validity_seconds: 90 * 60,
        activation_mode: "on_first_scan",
        is_active: true,
    },
    {
        id: "atm-weekly-pass",
        name: { en: "Weekly Pass", it: "Abbonamento settimanale" },
        kind: "time_pass",
        fare_cents: 1700,                                   // €17.00
        currency: "EUR",
        is_active: true,
    },
    {
        id: "atm-carnet-10",
        name: { en: "10-ride carnet", it: "Carnet 10 corse" },
        kind: "multi_ride",
        rides_total: 10,
        fare_cents: 2000,                                   // €20.00
        currency: "EUR",
        is_active: true,
    },
]);
```

A few minutes later, those tariffs appear in the Urbaniqo app for users in your service zone.

## Step 4 — Implement the `purchase.requested` webhook

When a user buys one of your tariffs, Urbaniqo POSTs `purchase.requested` to your webhook URL. **You must respond synchronously, in the same HTTP body, with a ticket code** — your existing ticketing system generates it. Within 10 seconds.

Minimal Express handler:

```ts
import express from "express";
import { verifyWebhook, UrbaniqoWebhookError } from "urbaniqo-sdk-js";

const app = express();

app.post(
    "/webhooks/urbaniqo",
    express.raw({ type: "application/json" }),    // raw bytes for signature verification
    async (req, res) => {
        let payload;
        try {
            payload = verifyWebhook({
                rawBody: req.body,
                headers: req.headers,
                secret: process.env.URBANIQO_WEBHOOK_SECRET!,
            });
        } catch (e) {
            if (e instanceof UrbaniqoWebhookError) {
                return res.status(e.reason === "invalid_signature" ? 401 : 400).end();
            }
            throw e;
        }

        if (payload.event === "purchase.requested") {
            const ticket = await yourTicketingSystem.issue({
                tariff: payload.data.tariff_id,
                userRef: payload.data.user_ref,
            });
            return res.json({
                code: ticket.code,                          // e.g. QR payload
                format: "qrcode",
                valid_from: ticket.from.toISOString(),
                valid_until: ticket.until.toISOString(),
            });
        }

        // refunded / expired events → just ack
        res.sendStatus(204);
    },
);
```

Same idea in Laravel:

```php
Route::post('/webhooks/urbaniqo', function (Request $r) {
    $verifier = new Verifier(config('services.urbaniqo.webhook_secret'));
    $payload = $verifier->verify($r->getContent(), $r->headers->all());

    if ($payload['event'] === 'purchase.requested') {
        $ticket = $ticketingSystem->issue($payload['data']['tariff_id']);
        return response()->json([
            'code' => $ticket->code,
            'format' => 'qrcode',
            'valid_from' => $ticket->from->toIso8601String(),
            'valid_until' => $ticket->until->toIso8601String(),
        ]);
    }
    return response()->noContent();
});
```

For a runnable mock server you can test against, see [`examples/mock-urbaniqo-server/`](../examples/mock-urbaniqo-server).

## Step 5 — (Optional) Report validation events

This is purely cosmetic: the customer sees a "validated 3 minutes ago at Termini" line in the Urbaniqo app. Skip it if your validators don't have connectivity.

```ts
await urbaniqo.recordValidation(ticketId, {
    validated_at: new Date().toISOString(),
    station_id: "M1-CADORNA",
    validator_id: "TURNSTILE-07",
});
```

## Step 6 — Go live

1. Switch your `agency_id` / `key_id` / `secret` from staging to production.
2. Update the webhook URL on the production environment in the dashboard.
3. Sanity-check from the dashboard's **Send test webhook** button — it issues a fake `purchase.requested` and shows your response inline.

## Common follow-ups

- Refund a ticket → see [protocol §5.3](./protocol.md#53-post-ticketsticket_idrefund).
- Multi-language tariff names → all locale keys in `name`/`description` are merged into Urbaniqo's UI.
- Multi-day passes → just set `valid_until` to anything; the protocol places no upper bound.
- Different code formats per tariff → the `format` field on the response is per-issuance, not per-tariff. You can return `qrcode` for the day pass and `ean13` for the single ride.
