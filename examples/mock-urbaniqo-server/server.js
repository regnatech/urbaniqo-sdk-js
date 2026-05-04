// @ts-check
//
// Mock Urbaniqo Transit API. Spins up an HTTP server that:
//   • Validates incoming agency requests with the same HMAC scheme as production.
//   • Stores tariffs / tickets in memory.
//   • Lets you POST to /admin/send-purchase to simulate a `purchase.requested`
//     webhook to your agency endpoint, and prints what your handler returns.
//
// Run:  npm install && AGENCY_SECRET=… AGENCY_WEBHOOK_SECRET=… AGENCY_WEBHOOK_URL=… npm start
//
// Defaults are filled with deterministic test values so you can also just
// `npm start` and use the matching credentials shown at the top of the log.

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import express from "express";

const PORT = Number(process.env.PORT ?? 4080);

// Test credentials — override via env to integrate with a real agency setup.
const AGENCY_ID = process.env.AGENCY_ID ?? "agency-test";
const KEY_ID    = process.env.KEY_ID    ?? "key-test";
const SECRET    = process.env.AGENCY_SECRET ?? "test-secret-test-secret-test-secret-test-secret-test-secret-test";
const WEBHOOK_SECRET = process.env.AGENCY_WEBHOOK_SECRET ?? "test-webhook-secret-test-webhook-secret-test-webhook-secret-test-webhook-secret";
const WEBHOOK_URL    = process.env.AGENCY_WEBHOOK_URL    ?? "http://localhost:3000/webhooks/urbaniqo";

const tariffs = new Map();   // tariffId → tariff
const tickets = new Map();   // ticketId → ticket

const app = express();

// Capture raw body for signature verification before JSON-parsing.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf.toString("utf8"); } }));

/* ───────────────────────── Auth middleware ───────────────────────── */

function canonical(method, path, ts, body) {
    return `${method.toUpperCase()}\n${path}\n${ts}\n${createHash("sha256").update(body ?? "").digest("hex")}`;
}

function safeEq(a, b) {
    try {
        const A = Buffer.from(a, "hex"), B = Buffer.from(b, "hex");
        return A.length > 0 && A.length === B.length && timingSafeEqual(A, B);
    } catch { return false; }
}

function requireSignedAgency(req, res, next) {
    const auth = req.header("Authorization") ?? "";
    const m = auth.match(/^UrbaniqoTransit-HMAC-SHA256 Credential=([^/]+)\/([^,]+), Signature=([0-9a-f]+)$/);
    if (!m) return problem(res, 401, "invalid_signature", "Missing/malformed Authorization header.");
    const [, agencyId, keyId, sig] = m;
    if (agencyId !== AGENCY_ID || keyId !== KEY_ID) {
        return problem(res, 401, "revoked_key", "Unknown credential.");
    }
    const ts = Number(req.header("X-Urbaniqo-Timestamp"));
    if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now()/1000) - ts) > 300) {
        return problem(res, 401, "expired_timestamp", "Timestamp drift > 300s.");
    }
    const expected = createHmac("sha256", SECRET).update(canonical(req.method, req.originalUrl, ts, req.rawBody)).digest("hex");
    if (!safeEq(expected, sig)) return problem(res, 401, "invalid_signature", "Bad signature.");
    next();
}

function problem(res, status, code, detail) {
    res.status(status).json({
        type: `https://urbaniqo.com/errors/${code}`,
        title: code.replace(/_/g, " "),
        status, error_code: code, detail,
    });
}

/* ───────────────────────── API endpoints ───────────────────────── */

const apiRouter = express.Router();
apiRouter.use(requireSignedAgency);

apiRouter.put("/tariffs", (req, res) => {
    const incoming = req.body?.tariffs;
    if (!Array.isArray(incoming)) return problem(res, 400, "invalid_payload", "Body must be {tariffs: []}.");
    const beforeIds = new Set(tariffs.keys());
    tariffs.clear();
    for (const t of incoming) tariffs.set(t.id, t);
    const archived = [...beforeIds].filter((id) => !tariffs.has(id)).length;
    res.json({
        applied_at: new Date().toISOString(),
        active_count: tariffs.size,
        archived_count: archived,
    });
});

apiRouter.post("/tariffs/:id/archive", (req, res) => {
    const t = tariffs.get(req.params.id);
    if (!t) return problem(res, 404, "tariff_not_found", "No such tariff.");
    t.is_active = false;
    res.status(204).end();
});

apiRouter.post("/tickets/:id/refund", (req, res) => {
    const t = tickets.get(req.params.id);
    if (!t) return problem(res, 404, "ticket_not_found", "No such ticket.");
    if (t.refunded_at) return problem(res, 409, "ticket_already_refunded", "Already refunded.");
    t.refunded_at = new Date().toISOString();
    res.json(t);
});

apiRouter.post("/tickets/:id/validations", (req, res) => {
    const t = tickets.get(req.params.id);
    if (!t) return problem(res, 404, "ticket_not_found", "No such ticket.");
    t.validations = (t.validations ?? []).concat(req.body);
    res.status(204).end();
});

apiRouter.get("/tickets/:id", (req, res) => {
    const t = tickets.get(req.params.id);
    if (!t) return problem(res, 404, "ticket_not_found", "No such ticket.");
    res.json(t);
});

app.use("/api/transit/v1", apiRouter);

/* ───────────────────────── Admin: simulate a purchase ───────────────────────── */

app.post("/admin/send-purchase", express.json(), async (req, res) => {
    const tariffId = req.body?.tariff_id;
    const tariff = tariffs.get(tariffId);
    if (!tariff) return res.status(404).json({ error: `Unknown tariff '${tariffId}'. Publish your catalog first.` });

    const orderId = "ord_" + randomUUID().slice(0, 8);
    const userRef = "uqo_user_" + randomUUID().slice(0, 6);
    const payload = {
        event: "purchase.requested",
        delivery_id: randomUUID(),
        created_at: new Date().toISOString(),
        data: {
            order_id: orderId,
            tariff_id: tariffId,
            user_ref: userRef,
            fare_cents: tariff.fare_cents,
            currency: tariff.currency,
            requested_at: new Date().toISOString(),
        },
    };
    const body = JSON.stringify(payload);
    const ts = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", WEBHOOK_SECRET)
        .update(canonical("POST", "WEBHOOK", ts, body))
        .digest("hex");

    const started = Date.now();
    let agencyResponse;
    try {
        const r = await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Urbaniqo-Event": payload.event,
                "X-Urbaniqo-Signature": sig,
                "X-Urbaniqo-Timestamp": String(ts),
                "X-Urbaniqo-Delivery": payload.delivery_id,
                "X-Urbaniqo-Protocol-Version": "1",
            },
            body,
            signal: AbortSignal.timeout(10_000),
        });
        const took = Date.now() - started;
        const text = await r.text();
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
        agencyResponse = { status: r.status, body: parsed, took_ms: took };

        if (r.ok && parsed && typeof parsed === "object" && parsed.code) {
            const ticketId = "tkt_" + randomUUID().slice(0, 8);
            tickets.set(ticketId, {
                id: ticketId,
                order_id: orderId,
                tariff_id: tariffId,
                user_ref: userRef,
                code: parsed.code,
                format: parsed.format,
                valid_from: parsed.valid_from,
                valid_until: parsed.valid_until,
                rides_total: parsed.rides_total ?? null,
                rides_remaining: parsed.rides_total ?? null,
                issued_at: new Date().toISOString(),
                refunded_at: null,
                metadata: parsed.metadata ?? {},
            });
            agencyResponse.ticket_id = ticketId;
        }
    } catch (e) {
        agencyResponse = { error: e?.message ?? String(e), took_ms: Date.now() - started };
    }

    res.json({ webhook_url: WEBHOOK_URL, payload, agency_response: agencyResponse });
});

/* ───────────────────────── Boot ───────────────────────── */

app.listen(PORT, () => {
    console.log("\nMock Urbaniqo Transit API listening on http://localhost:" + PORT);
    console.log("\n  Agency credentials:");
    console.log("    URBANIQO_AGENCY_ID    =", AGENCY_ID);
    console.log("    URBANIQO_KEY_ID       =", KEY_ID);
    console.log("    URBANIQO_SECRET       =", SECRET);
    console.log("    URBANIQO_WEBHOOK_SECRET =", WEBHOOK_SECRET);
    console.log("\n  Point your SDK at:    baseUrl: 'http://localhost:" + PORT + "/api/transit/v1'");
    console.log("  We will deliver webhooks to:  " + WEBHOOK_URL);
    console.log("\n  Try it:");
    console.log(`    1. Publish a tariff via your SDK against the URL above.`);
    console.log(`    2. POST a fake purchase:`);
    console.log(`       curl -X POST http://localhost:${PORT}/admin/send-purchase \\`);
    console.log(`            -H 'Content-Type: application/json' \\`);
    console.log(`            -d '{"tariff_id": "atm-urban-90"}'`);
    console.log("");
});
