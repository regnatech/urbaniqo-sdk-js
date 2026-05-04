# Webhooks

Urbaniqo POSTs JSON to your `webhook_url` whenever something happens to a ticket you sold. This page is the deep dive on signing, retries and dedup. The SDKs (`urbaniqo-sdk-js`, `regna/urbaniqo-sdk`) handle most of it — but it's worth understanding what they do.

## Event matrix

| Event | Sync? | Body must contain | Retries on non-2xx? |
|---|---|---|---|
| `purchase.requested` | **Yes** — your response is the ticket | A response with `code`, `format`, `valid_from`, `valid_until` | **No** (would cause double-issuance) |
| `purchase.refunded`  | No | — | Yes (10s → 1m → 5m → 30m → 2h, max 5) |
| `ticket.expired`     | No | — | Yes (same backoff) |

`purchase.requested` is the one that matters operationally. If it times out, the customer is refunded and sees an error — but their ticketing experience is broken. Aim for a P99 of < 2 seconds.

## Signing scheme

Every delivery carries:

```
X-Urbaniqo-Event:     payment.succeeded | payment.failed | payment.refunded | …
X-Urbaniqo-Signature: hex(HMAC-SHA256(webhook_secret, canonical))
X-Urbaniqo-Timestamp: <unix seconds>
X-Urbaniqo-Delivery:  <uuid>
X-Urbaniqo-Protocol-Version: 1
```

Where `canonical` is the same canonical string used by the API (see [protocol §3.1](./protocol.md#31-outbound-request-signing-agency--urbaniqo)), with one substitution: the **path** is the literal sentinel `WEBHOOK`. This makes the signature independent of the URL the agency hosts the webhook at, so reverse-proxies and tunnels can rewrite paths without breaking it.

```
canonical = "POST\nWEBHOOK\n<timestamp>\n<sha256_hex(body)>"
```

## Verify in 6 lines (Node)

```ts
import { verifyWebhook, UrbaniqoWebhookError } from "urbaniqo-sdk-js";
try {
    const payload = verifyWebhook({
        rawBody: req.body,                 // Buffer or string — raw bytes
        headers: req.headers,
        secret: process.env.URBANIQO_WEBHOOK_SECRET,
    });
} catch (e: any) {
    return res.status(e.reason === "invalid_signature" ? 401 : 400).end();
}
```

## Verify in 6 lines (PHP)

```php
use Regna\UrbaniqoSdk\Webhooks\Verifier;
use Regna\UrbaniqoSdk\Exceptions\UrbaniqoWebhookException;

try {
    $payload = (new Verifier(config('services.urbaniqo.webhook_secret')))
        ->verify($request->getContent(), $request->headers->all());
} catch (UrbaniqoWebhookException $e) {
    return response()->noContent($e->reason === 'invalid_signature' ? 401 : 400);
}
```

## Manual verification (any language)

If you can't use the SDK, here is the algorithm:

```pseudocode
expected = lowercase_hex(HMAC_SHA256(
    webhook_secret,
    "POST\nWEBHOOK\n" + X-Urbaniqo-Timestamp + "\n" + lowercase_hex(SHA256(raw_body))
))

ok = constant_time_equals(expected, X-Urbaniqo-Signature)
fresh = abs(now() - X-Urbaniqo-Timestamp) <= 300
```

Reject if `ok` or `fresh` is false. Always parse JSON **after** the check passes.

## Idempotency / dedup

`X-Urbaniqo-Delivery` is a UUID. The same UUID arrives multiple times when:

- the previous response timed out from our side,
- the previous response was a 5xx,
- a network blip reset the connection mid-response.

Dedupe by storing delivery IDs for at least **24 hours** (a TTL cache works). On a duplicate, return the same HTTP response you returned the first time.

```ts
const cache = new Map<string, ResponsePayload>();   // production: use Redis

if (cache.has(payload.delivery_id)) {
    return res.json(cache.get(payload.delivery_id));
}
const issued = await issueTicket(payload.data);
cache.set(payload.delivery_id, issued);
return res.json(issued);
```

## Failure modes

| Symptom | Cause | Fix |
|---|---|---|
| `invalid_signature` | The body was re-serialized before reaching the verifier | Ensure you pass the raw HTTP body. In Express use `express.raw()`, in Laravel use `$request->getContent()`. |
| `stale_timestamp` | Server clock drift > 5 min | Sync your server with NTP. |
| `missing_header` | Reverse proxy stripped headers | Allow `X-Urbaniqo-*` headers in your proxy config. |
| `purchase.requested` returns 2xx but no ticket | Your handler responded with `204` instead of a ticket body | Always include `{code, format, valid_from, valid_until}` for `purchase.requested`. |
| Customer sees "issue timed out" | Your handler took > 10 s | Issue tickets asynchronously? You can't — the response IS the ticket. Optimize the issuance path. |

## Rotating the webhook secret

In the agency dashboard → **API & Webhooks** → **Rotate webhook secret**. The new secret is shown once. Until you redeploy with the new value, signature verification will fail and Urbaniqo's retry machinery will start backing off.

For zero-downtime rotation, the SDK does not support dual-secret verification natively — implement it in your handler:

```ts
function verifyEither(...) {
    try { return verifyWebhook({ ..., secret: NEW }); }
    catch { return verifyWebhook({ ..., secret: OLD }); }
}
```

Drop the OLD branch a few hours after rotation.
