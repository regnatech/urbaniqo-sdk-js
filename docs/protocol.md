# Urbaniqo Transit Protocol — v1

> Wire-level specification. Both SDKs (`urbaniqo-sdk-js`, `regna/urbaniqo-sdk`) implement this exactly. If you write a custom client in another language, this document is the contract.

---

## 1. Roles

- **Urbaniqo Transit** — the platform. Hosts the user, charges the card, displays the ticket.
- **Agency** — the transport operator (e.g. ATM, ATAC, AMT). Owns the ticket inventory, the validators, the rules.
- **Customer** — the Urbaniqo end-user.

The agency's existing ticketing system is the source of truth. Urbaniqo does **not** generate ticket codes, does **not** decide validity, and does **not** validate at the gate.

## 2. Versioning

- Protocol version is `v1`. The current version is communicated in the API base URL (`/api/transit/v1/...`) and in the `X-Urbaniqo-Protocol-Version` header on webhooks.
- Backward-compatible changes (new optional fields, new event types) ship as `v1.x`. Breaking changes ship as `v2`.
- An agency can be opted into a specific minor version via its dashboard settings.

## 3. Identity & Authentication

Each agency owns one or more **API keys**. A key has:

| Field | Purpose |
|---|---|
| `agency_id` | Public, identifies the agency. UUIDv7. |
| `key_id` | Public, identifies the key inside the agency. Short opaque string. |
| `secret` | 64-char random, returned **once** at creation. Used to sign requests. |
| `webhook_secret` | 64-char random. Used to sign **inbound** webhooks the agency receives. Distinct from `secret` so they can be rotated independently. |

Agencies create and rotate keys from their Urbaniqo dashboard.

### 3.1 Outbound request signing (Agency → Urbaniqo)

Every API request carries:

```http
Authorization: UrbaniqoTransit-HMAC-SHA256 Credential={agency_id}/{key_id}, Signature={hex}
X-Urbaniqo-Timestamp: 1730000000
```

The signature is computed over a canonical string:

```
{HTTP_METHOD}\n{REQUEST_PATH}\n{TIMESTAMP}\n{SHA256_HEX(BODY)}
```

- `HTTP_METHOD` uppercase (`POST`, `GET`, …).
- `REQUEST_PATH` includes the query string, percent-encoded as sent.
- `TIMESTAMP` matches the `X-Urbaniqo-Timestamp` header (Unix seconds).
- `BODY` is the raw bytes; for empty bodies use `SHA256_HEX("")` (`e3b0c44…b855`).

Then `Signature = lowercase_hex(HMAC_SHA256(secret, canonical))`.

Urbaniqo rejects requests where:
- the signature does not verify (constant-time comparison),
- the timestamp drifts more than **300 seconds** from server time,
- the credential references a revoked key.

### 3.2 Inbound webhook signing (Urbaniqo → Agency)

Webhooks carry the same scheme, but reversed: Urbaniqo signs with the agency's `webhook_secret`. The agency verifies with the same algorithm. See [`webhooks.md`](./webhooks.md).

## 4. Tariff model

A **tariff** is a sellable product (single ticket, day pass, weekly subscription, …) the agency exposes to Urbaniqo's catalog.

### 4.1 Tariff kinds

| Kind | Description | Validity expressed via |
|---|---|---|
| `single_ride` | One validation, one journey. | `valid_from`, `valid_until` returned per ticket |
| `multi_ride` | A bundle of N rides on the same code, each consuming one ride. | `rides_total` + activation rules |
| `time_pass` | Unlimited validations within a time window — covers day passes, weekly passes, monthly subscriptions. | `valid_from`, `valid_until` (any duration, no upper bound) |

Multi-day duration is just a `time_pass` with `valid_until = valid_from + N days`. The protocol places no cap on the duration — yearly subscriptions are valid.

### 4.2 Tariff payload

```json
{
  "id": "atm-urban-90",
  "name": {"en": "Urban 90′", "it": "Urbano 90′"},
  "description": {"en": "Single ride within Milan urban area, 90 minutes.", "it": "..."},
  "kind": "single_ride",
  "fare_cents": 220,
  "currency": "EUR",
  "zones": ["Mi1", "Mi3"],
  "default_validity_seconds": 5400,
  "activation_mode": "on_first_scan",
  "rides_total": null,
  "is_active": true,
  "metadata": {"network": "atm"}
}
```

| Field | Type | Notes |
|---|---|---|
| `id` | string ≤ 64 | Stable, agency-scoped. Used as the lookup key in subsequent calls. |
| `name`, `description` | `{<bcp47>: string}` | At least `en` is required. Other locales are merged into Urbaniqo's UI. |
| `kind` | enum | See §4.1 |
| `fare_cents` | integer ≥ 50 | Minimum chargeable amount: €0.50 (Stripe minimum). |
| `currency` | ISO 4217 | `EUR` only in v1. |
| `zones` | string[] | Free-form labels; shown to the user. |
| `default_validity_seconds` | integer | Used when the agency does not return explicit `valid_from`/`valid_until` at issuance. |
| `activation_mode` | `on_purchase` \| `on_first_scan` | Hint to the user UX. The actual validity comes from the issued ticket. |
| `rides_total` | integer or `null` | Required for `multi_ride`, must be `null` for the others. |
| `is_active` | boolean | When `false`, Urbaniqo hides it from the catalog but existing tickets remain valid. |
| `metadata` | object ≤ 4 KB | Pass-through; never shown to the user. |

## 5. API — Agency calls Urbaniqo

Base URL: `https://urbaniqo.com/api/transit/v1`

All responses are JSON. Errors follow the [Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc7807) format extended with an `error_code` field — see [`error-codes.md`](./error-codes.md).

### 5.1 `PUT /tariffs` — upsert catalog

Replace the agency's catalog with the provided list. Tariffs not present in the body are **archived** (not deleted, so existing tickets stay attributable).

Request body:

```json
{ "tariffs": [ /* see §4.2 */ ] }
```

Response:

```json
{
  "applied_at": "2026-05-04T10:00:00Z",
  "active_count": 14,
  "archived_count": 2
}
```

Idempotent: the same payload twice produces the same end state.

### 5.2 `POST /tariffs/{id}/archive`

Mark a single tariff as inactive without re-uploading the whole catalog.

### 5.3 `POST /tickets/{ticket_id}/refund`

Trigger a refund. The customer is refunded for the original amount on the original card.

```json
{ "reason": "service_disruption" }
```

`reason` is one of:

- `customer_request`
- `service_disruption`
- `agency_error`
- `fraud_suspected`

Returns the refunded ticket envelope (see §6.2).

### 5.4 `POST /tickets/{ticket_id}/validations` — record a validation event

Optional. If you call this when your validator scans the code, the customer sees the validation in the Urbaniqo app within seconds.

```json
{
  "validated_at": "2026-05-04T08:14:22Z",
  "station_id": "M1-CADORNA",
  "validator_id": "TURNSTILE-07",
  "metadata": { "direction": "inbound" }
}
```

Validation events are append-only — Urbaniqo never modifies your records.

### 5.5 `GET /tickets/{ticket_id}` — read

Returns the ticket envelope. Useful for support or reconciliation.

## 6. Webhooks — Urbaniqo calls Agency

Configured via the agency dashboard. Two endpoints (one for sync, one for async events) or a single one is fine — the SDK dispatches by `event` field.

### 6.1 `purchase.requested` — synchronous

This is **the** critical webhook. Urbaniqo sends it after the customer has paid; the agency MUST respond in the same HTTP response body with the ticket code, or the purchase is rolled back and the customer is refunded.

**Headers**

```http
X-Urbaniqo-Event: purchase.requested
X-Urbaniqo-Signature: {hex_hmac_sha256}
X-Urbaniqo-Timestamp: 1730000000
X-Urbaniqo-Delivery: {uuid}
X-Urbaniqo-Protocol-Version: 1
Content-Type: application/json
```

**Body**

```json
{
  "event": "purchase.requested",
  "delivery_id": "0192a4…",
  "created_at": "2026-05-04T08:00:00Z",
  "data": {
    "order_id": "ord_2x5d8r",
    "tariff_id": "atm-urban-90",
    "user_ref": "uqo_user_b3f9",
    "fare_cents": 220,
    "currency": "EUR",
    "requested_at": "2026-05-04T08:00:00Z"
  }
}
```

`user_ref` is opaque — the agency cannot resolve it to a real identity. Use it as your customer correlation key.

**Required response (HTTP 200, within 10 seconds)**

```json
{
  "code": "M1-90-A1B2C3D4E5",
  "format": "qrcode",
  "valid_from": "2026-05-04T08:00:00Z",
  "valid_until": "2026-05-04T09:30:00Z",
  "rides_total": null,
  "metadata": { "issued_by": "vending-online" }
}
```

| Response field | Notes |
|---|---|
| `code` | The string the validator will read. Up to 4 KB. For QR/PDF417 this is the literal payload to encode. |
| `format` | One of: `qrcode`, `code128`, `code39`, `ean13`, `ean8`, `pdf417`, `aztec`, `datamatrix`, `text`. See [`barcode-formats.md`](./barcode-formats.md). |
| `valid_from` | ISO 8601. May be in the future for scheduled tickets. |
| `valid_until` | ISO 8601. **No upper bound** — set it to one year from now for an annual pass and Urbaniqo will display it as such. |
| `rides_total` | Required for `multi_ride` tariffs, otherwise `null`. |
| `metadata` | Object, ≤ 4 KB. Returned to the agency on read; never shown to the user. |

**Failure responses**

Return a 4xx with a Problem Details body:

```json
{
  "type": "https://urbaniqo.com/errors/sold_out",
  "title": "Out of stock",
  "status": 409,
  "error_code": "sold_out",
  "detail": "No tickets available for this tariff right now."
}
```

Urbaniqo refunds the customer and shows them an appropriate message based on `error_code`. See [`error-codes.md`](./error-codes.md).

**Timeouts**

If the agency does not respond within 10 seconds, Urbaniqo treats it as a transport failure: the customer is refunded and the order is marked `failed`. Urbaniqo does NOT retry `purchase.requested` automatically — retrying could cause double-issuance. The customer can re-attempt the purchase from the app.

### 6.2 `purchase.refunded` — informational, asynchronous

Sent when a refund is processed (either by the agency calling `POST /tickets/{id}/refund` or by the user requesting one through Urbaniqo support).

```json
{
  "event": "purchase.refunded",
  "delivery_id": "0192a5…",
  "created_at": "2026-05-04T12:00:00Z",
  "data": {
    "ticket_id": "tkt_9z3d2k",
    "order_id": "ord_2x5d8r",
    "tariff_id": "atm-urban-90",
    "user_ref": "uqo_user_b3f9",
    "refund_id": "rfd_1x2y3z",
    "amount_cents": 220,
    "currency": "EUR",
    "reason": "customer_request",
    "refunded_at": "2026-05-04T12:00:00Z"
  }
}
```

The agency must ack with HTTP 2xx. On non-2xx or transport error, Urbaniqo retries with exponential backoff: **10s → 1m → 5m → 30m → 2h**, max 5 attempts. The same `delivery_id` is reused on every retry — dedupe accordingly.

### 6.3 `ticket.expired` — informational, asynchronous (optional)

Sent once when `valid_until` passes. Useful for analytics or invalidating any internal cache. Same retry policy as `purchase.refunded`.

```json
{
  "event": "ticket.expired",
  "data": {
    "ticket_id": "tkt_9z3d2k",
    "tariff_id": "atm-urban-90",
    "expired_at": "2026-05-04T09:30:00Z"
  }
}
```

## 7. Idempotency & dedup

- **Outbound API calls (Agency → Urbaniqo)**: include an `Idempotency-Key` header (any opaque string ≤ 128 chars). Urbaniqo stores the response for 24 hours; replaying the same key returns the cached response.
- **Inbound webhooks (Urbaniqo → Agency)**: dedupe by `X-Urbaniqo-Delivery`. The same delivery ID may arrive multiple times (under retry); process once.

## 8. Rate limits

| Endpoint | Limit | Headers |
|---|---|---|
| `PUT /tariffs` | 60 / hour | `Retry-After`, `RateLimit-Remaining` |
| `POST /tickets/{id}/refund` | 600 / minute | same |
| `POST /tickets/{id}/validations` | 6000 / minute | same |
| `GET /tickets/{id}` | 6000 / minute | same |

Limits are per agency, not per key. Above the limit, the API returns 429.

## 9. Security checklist

For agencies implementing this:

- [ ] Verify `X-Urbaniqo-Signature` on every webhook with a constant-time comparison.
- [ ] Reject webhooks where `|now - X-Urbaniqo-Timestamp| > 300 s`.
- [ ] Dedupe by `X-Urbaniqo-Delivery`; cache for at least 24 h.
- [ ] Treat `purchase.requested` as **non-replayable** — issue a ticket only on first delivery, not on retry (§6.1 says we don't retry, but the customer might re-attempt).
- [ ] Rotate `secret` and `webhook_secret` independently if either is exposed.
- [ ] Never log `secret` / `webhook_secret` plaintext.
- [ ] Pin to TLS 1.2+ when calling Urbaniqo.

## 10. Reference implementations

- TypeScript / Node.js: [`urbaniqo-sdk-js`](https://github.com/regnatech/urbaniqo-sdk-js) (this repo)
- PHP: [`regna/urbaniqo-sdk`](https://github.com/regnatech/urbaniqo-sdk-php)

Both pass the same test vectors documented in [`test-vectors.md`](./test-vectors.md).
