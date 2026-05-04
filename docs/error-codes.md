# Error codes

All non-2xx responses follow [RFC 7807 Problem Details](https://www.rfc-editor.org/rfc/rfc7807) extended with an `error_code` field:

```json
{
  "type": "https://urbaniqo.com/errors/sold_out",
  "title": "Out of stock",
  "status": 409,
  "error_code": "sold_out",
  "detail": "No tickets available for this tariff right now.",
  "instance": "/api/transit/v1/tickets/tkt_…/refund"
}
```

The same `error_code` set is used in **two directions**:

- Urbaniqo → Agency (when our API responds with a 4xx/5xx).
- Agency → Urbaniqo (your `purchase.requested` response can also carry one of these codes when you can't fulfil the request).

## Codes

### Authentication

| Code | HTTP | Direction | Meaning | Customer-facing message |
|---|---|---|---|---|
| `invalid_signature` | 401 | both | The HMAC signature does not verify. | "Cannot reach the operator." (logged & alerted) |
| `expired_timestamp` | 401 | both | Request timestamp is more than 5 minutes off. | Same. Sync your clock. |
| `revoked_key`       | 401 | Urbaniqo → Agency | The API key has been revoked from the dashboard. | Same. Issue a new key. |

### Resource state

| Code | HTTP | Direction | Meaning | Customer-facing message |
|---|---|---|---|---|
| `tariff_not_found` | 404 | Urbaniqo → Agency | The `tariff_id` you passed does not exist (typo, archived, never published). | — |
| `ticket_not_found` | 404 | Urbaniqo → Agency | The `ticket_id` does not exist or doesn't belong to your agency. | — |
| `ticket_already_refunded` | 409 | Urbaniqo → Agency | The ticket is already in `refunded` state. Refunds are not idempotent on this code; second call is rejected. | — |
| `sold_out` | 409 | Agency → Urbaniqo | You can't issue this tariff right now (zone closed, technical issue, capacity hit). | "This ticket is temporarily unavailable. Try again in a few minutes." |
| `service_disrupted` | 503 | Agency → Urbaniqo | Your service is down. The user knows it's not their fault. | "{Agency name} is currently disrupted. We won't sell tickets until they recover." |
| `invalid_payload` | 400 | both | Request body fails schema validation. The Problem Details body lists the offending fields. | (logged) |

### Operational

| Code | HTTP | Direction | Meaning | Customer-facing message |
|---|---|---|---|---|
| `rate_limited` | 429 | Urbaniqo → Agency | You exceeded the rate limit for this endpoint. Honour `Retry-After`. | (transparent — SDK retries with backoff) |
| `internal_error` | 500 | both | Unexpected failure on our side. Please retry. | (transparent — SDK retries with backoff) |

## Retry guidance

The SDK retries automatically on:

- HTTP `5xx`,
- HTTP `429`,
- transport errors (DNS, TCP reset, TLS handshake fail, timeout).

It never retries on `4xx` other than `429` — those are caller errors that won't go away.

`recordValidation()` is **not retried** even on 5xx, because validation events are inherently time-stamped and a delayed retry would either log the wrong time or duplicate a perfectly fresh event from a real validator.

## Picking the right code in `purchase.requested` responses

You're encouraged to use the precise code:

| Situation in your ticketing system | Return |
|---|---|
| Tariff exists but you can't issue this minute (system busy) | 503 + `service_disrupted` |
| Tariff sold out for the day (e.g. event ticket) | 409 + `sold_out` |
| The `tariff_id` in the body is one you don't recognize | 404 + `tariff_not_found` |
| Catch-all bug | 500 + `internal_error` |

Urbaniqo translates these into user-facing copy in the customer's language. **Do not** invent new codes — anything outside this set is treated as `internal_error` and shown as a generic "We couldn't issue your ticket. You haven't been charged."
