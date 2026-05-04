// Minimal Express webhook handler for Urbaniqo Transit.
//
// Run together with the mock server:
//   1. (in another terminal) cd ../mock-urbaniqo-server && npm start
//   2. (here)                npm install && npm start
//   3. (anywhere) curl -X POST http://localhost:4080/admin/send-purchase \
//                       -H 'Content-Type: application/json' \
//                       -d '{"tariff_id": "atm-urban-90"}'
//
// You'll need to publish 'atm-urban-90' first via the SDK against the mock,
// e.g. `node publish-catalog.js` (see the repo root README for an example).

import express from "express";
import {
    UrbaniqoClient,
    verifyWebhook,
    UrbaniqoWebhookError,
} from "urbaniqo-sdk-js";

const PORT = Number(process.env.PORT ?? 3000);
const WEBHOOK_SECRET = process.env.URBANIQO_WEBHOOK_SECRET
    ?? "test-webhook-secret-test-webhook-secret-test-webhook-secret-test-webhook-secret";

// (Optional) build a client to call back into Urbaniqo from the same process,
// e.g. to refund or record validations later. Not strictly required to handle
// purchase.requested — that one's pure request/response.
const urbaniqo = new UrbaniqoClient({
    agencyId: process.env.URBANIQO_AGENCY_ID ?? "agency-test",
    keyId:    process.env.URBANIQO_KEY_ID    ?? "key-test",
    secret:   process.env.URBANIQO_SECRET    ?? "test-secret-test-secret-test-secret-test-secret-test-secret-test",
    baseUrl:  process.env.URBANIQO_BASE_URL  ?? "http://localhost:4080/api/transit/v1",
});

const app = express();

// In-memory dedup cache for X-Urbaniqo-Delivery. Production: use Redis.
const seenDeliveries = new Map();
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

app.post(
    "/webhooks/urbaniqo",
    // CRITICAL: capture raw bytes so signature verification works.
    express.raw({ type: "application/json" }),
    async (req, res) => {
        let payload;
        try {
            payload = verifyWebhook({
                rawBody: req.body,
                headers: req.headers,
                secret: WEBHOOK_SECRET,
            });
        } catch (e) {
            if (e instanceof UrbaniqoWebhookError) {
                console.warn("[urbaniqo] rejected webhook:", e.reason);
                return res.status(e.reason === "invalid_signature" ? 401 : 400).end();
            }
            throw e;
        }

        // Idempotent re-delivery: return the same response we returned the first time.
        const cached = seenDeliveries.get(payload.delivery_id);
        if (cached) {
            console.log("[urbaniqo] duplicate delivery, replaying response");
            return res.status(cached.status).json(cached.body);
        }

        if (payload.event === "purchase.requested") {
            // Replace this stub with a real call into your ticketing system.
            const ticket = issueTicketStub(payload.data);
            const response = {
                code: ticket.code,
                format: ticket.format,
                valid_from: ticket.validFrom.toISOString(),
                valid_until: ticket.validUntil.toISOString(),
            };
            cacheDelivery(payload.delivery_id, 200, response);
            console.log("[urbaniqo] issued", ticket.code, "for", payload.data.order_id);
            return res.json(response);
        }

        if (payload.event === "purchase.refunded") {
            console.log("[urbaniqo] refunded ticket", payload.data.ticket_id);
            cacheDelivery(payload.delivery_id, 204, null);
            return res.sendStatus(204);
        }

        // ticket.expired or other events
        cacheDelivery(payload.delivery_id, 204, null);
        res.sendStatus(204);
    },
);

function issueTicketStub(data) {
    // Production: call your ticketing system here. Be quick — the customer
    // is staring at a spinner. Aim for < 2 s P99.
    const code = `M1-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const validFrom = new Date();
    const validUntil = new Date(Date.now() + 90 * 60 * 1000); // 90 minutes
    return { code, format: "qrcode", validFrom, validUntil };
}

function cacheDelivery(deliveryId, status, body) {
    seenDeliveries.set(deliveryId, { status, body });
    setTimeout(() => seenDeliveries.delete(deliveryId), DEDUPE_TTL_MS).unref();
}

app.listen(PORT, () => {
    console.log(`Agency webhook listening on http://localhost:${PORT}/webhooks/urbaniqo`);
    console.log(`Pointed at Urbaniqo:           ${process.env.URBANIQO_BASE_URL ?? "http://localhost:4080/api/transit/v1"}`);
});

// Touch the SDK so unused-import warnings don't fire if you're reading
// this code without running it.
void urbaniqo;
