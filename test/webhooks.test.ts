import { describe, expect, it } from "vitest";
import { canonicalRequest, signCanonical } from "../src/auth.js";
import { verifyWebhook, createWebhookDispatcher } from "../src/webhooks.js";
import { UrbaniqoWebhookError } from "../src/errors.js";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function buildSignedDelivery(payload: object, opts: { secret?: string; timestamp?: number; event?: string } = {}) {
    const secret = opts.secret ?? SECRET;
    const timestamp = opts.timestamp ?? 1700000000;
    const body = JSON.stringify(payload);
    const sig = signCanonical(secret, canonicalRequest("POST", "WEBHOOK", timestamp, body));
    return {
        body,
        headers: {
            "X-Urbaniqo-Event": opts.event ?? (payload as { event?: string }).event ?? "purchase.requested",
            "X-Urbaniqo-Signature": sig,
            "X-Urbaniqo-Timestamp": String(timestamp),
            "X-Urbaniqo-Delivery": "test-delivery-1",
        },
    };
}

const samplePurchase = {
    event: "purchase.requested" as const,
    delivery_id: "test-delivery-1",
    created_at: "2026-05-04T08:00:00Z",
    data: {
        order_id: "ord_x",
        tariff_id: "atm-urban-90",
        user_ref: "uqo_user_y",
        fare_cents: 220,
        currency: "EUR" as const,
        requested_at: "2026-05-04T08:00:00Z",
    },
};

describe("verifyWebhook", () => {
    it("accepts a correctly signed payload", () => {
        const { body, headers } = buildSignedDelivery(samplePurchase);
        const got = verifyWebhook({ rawBody: body, headers, secret: SECRET, now: () => 1700000000 });
        expect(got.event).toBe("purchase.requested");
        if (got.event === "purchase.requested") {
            expect(got.data.order_id).toBe("ord_x");
        }
    });

    it("rejects a tampered body", () => {
        const { body, headers } = buildSignedDelivery(samplePurchase);
        const tampered = body.replace("ord_x", "ord_HIJACKED");
        expect(() =>
            verifyWebhook({ rawBody: tampered, headers, secret: SECRET, now: () => 1700000000 }),
        ).toThrowError(UrbaniqoWebhookError);
    });

    it("rejects a wrong secret", () => {
        const { body, headers } = buildSignedDelivery(samplePurchase, { secret: "WRONG" });
        expect(() =>
            verifyWebhook({ rawBody: body, headers, secret: SECRET, now: () => 1700000000 }),
        ).toThrowError(UrbaniqoWebhookError);
    });

    it("rejects a stale timestamp (>5 min)", () => {
        const { body, headers } = buildSignedDelivery(samplePurchase, { timestamp: 1700000000 });
        // now is 6 minutes in the future
        expect(() =>
            verifyWebhook({ rawBody: body, headers, secret: SECRET, now: () => 1700000000 + 360 }),
        ).toThrowError(UrbaniqoWebhookError);
    });

    it("rejects when event header doesn't match payload", () => {
        const { body, headers } = buildSignedDelivery(samplePurchase, { event: "purchase.refunded" });
        // Re-sign with the new (mismatched) event header doesn't help: the
        // event check happens after signature verification, so we need to
        // re-sign or the signature is the obvious failure first. We
        // deliberately keep signature valid by signing the body that is
        // posted, then mismatching only the header:
        // (helper signs body — header mismatch is the failure here)
        expect(() =>
            verifyWebhook({ rawBody: body, headers, secret: SECRET, now: () => 1700000000 }),
        ).toThrowError(UrbaniqoWebhookError);
    });

    it("works with Headers-like (Fetch API) objects", () => {
        const { body, headers } = buildSignedDelivery(samplePurchase);
        const fetchHeaders = new Headers(headers);
        const got = verifyWebhook({ rawBody: body, headers: fetchHeaders, secret: SECRET, now: () => 1700000000 });
        expect(got.event).toBe("purchase.requested");
    });
});

describe("createWebhookDispatcher", () => {
    it("routes to the matching handler and returns its result", async () => {
        const dispatch = createWebhookDispatcher({
            "purchase.requested": (p) => ({ code: `T-${p.data.order_id}`, format: "qrcode" as const, valid_from: "x", valid_until: "y" }),
        });
        const result = (await dispatch(samplePurchase)) as { code: string };
        expect(result.code).toBe("T-ord_x");
    });

    it("returns undefined for unhandled events", async () => {
        const dispatch = createWebhookDispatcher({});
        const result = await dispatch(samplePurchase);
        expect(result).toBeUndefined();
    });
});
