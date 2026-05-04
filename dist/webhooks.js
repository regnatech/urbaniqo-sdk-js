import { canonicalRequest, safeEqualHex, signCanonical, sha256Hex } from "./auth.js";
import { UrbaniqoWebhookError } from "./errors.js";
function getHeader(h, name) {
    if (typeof h.get === "function") {
        return h.get(name) ?? null;
    }
    const lower = name.toLowerCase();
    const map = h;
    for (const key of Object.keys(map)) {
        if (key.toLowerCase() === lower) {
            const v = map[key];
            return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
        }
    }
    return null;
}
/**
 * Verify a webhook delivery and return the parsed payload. Throws
 * `UrbaniqoWebhookError` on any signature, timestamp or shape problem — the
 * caller MUST translate that into a 401/400 response and not process the
 * payload.
 *
 * IMPORTANT: pass the *raw* HTTP body. If your framework parses JSON
 * automatically, configure it to also expose the raw bytes — see the
 * Express / Laravel examples in the repo.
 *
 * Note on auth.ts: the same canonical string is used for outbound API calls
 * and inbound webhooks; we route webhooks through path = the request path
 * Urbaniqo POSTed to (use the agency-side server's view, e.g. "/webhooks/urbaniqo").
 */
export function verifyWebhook(opts) {
    const { rawBody, headers, secret } = opts;
    const tolerance = opts.toleranceSeconds ?? 300;
    const now = opts.now?.() ?? Math.floor(Date.now() / 1000);
    const event = getHeader(headers, "X-Urbaniqo-Event");
    const signature = getHeader(headers, "X-Urbaniqo-Signature");
    const timestampStr = getHeader(headers, "X-Urbaniqo-Timestamp");
    const delivery = getHeader(headers, "X-Urbaniqo-Delivery");
    if (!event || !signature || !timestampStr || !delivery) {
        throw new UrbaniqoWebhookError("missing_header", "Required Urbaniqo webhook headers are missing.");
    }
    const timestamp = Number.parseInt(timestampStr, 10);
    if (!Number.isFinite(timestamp)) {
        throw new UrbaniqoWebhookError("missing_header", "X-Urbaniqo-Timestamp is not a valid integer.");
    }
    if (Math.abs(now - timestamp) > tolerance) {
        throw new UrbaniqoWebhookError("stale_timestamp", `Timestamp drift > ${tolerance}s; rejecting webhook.`);
    }
    // Webhooks share the same canonical-request format; for inbound the
    // "path" in the canonical string is the literal "WEBHOOK" sentinel so
    // that the signature is independent of where the agency hosts its
    // endpoint (different proxies may rewrite paths).
    const canonical = canonicalRequest("POST", "WEBHOOK", timestamp, rawBody);
    const expected = signCanonical(secret, canonical);
    if (!safeEqualHex(expected, signature)) {
        throw new UrbaniqoWebhookError("invalid_signature", "Webhook signature does not match.");
    }
    let payload;
    try {
        const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(rawBody);
        payload = JSON.parse(text);
    }
    catch {
        throw new UrbaniqoWebhookError("malformed_body", "Webhook body is not valid JSON.");
    }
    if (!payload || payload.event !== event) {
        throw new UrbaniqoWebhookError("malformed_body", "Webhook event header does not match payload.event.");
    }
    // Touch sha256Hex to keep the bundler from tree-shaking it; it is part
    // of the public surface (advanced users may want to compute body hashes
    // for their own audit logs).
    void sha256Hex;
    return payload;
}
/**
 * Builds a strongly-typed dispatcher for a set of webhook events. Returns
 * the raw return value of the matched handler — caller decides how to
 * encode it (e.g. JSON.stringify for `purchase.requested`).
 */
export function createWebhookDispatcher(handlers) {
    return async function dispatch(payload) {
        const handler = handlers[payload.event];
        if (!handler)
            return undefined;
        return handler(payload);
    };
}
//# sourceMappingURL=webhooks.js.map