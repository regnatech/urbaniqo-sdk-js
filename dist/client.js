import { canonicalRequest, signCanonical } from "./auth.js";
import { UrbaniqoApiError, UrbaniqoTransportError } from "./errors.js";
const DEFAULT_BASE_URL = "https://urbaniqo.com/api/transit/v1";
const SDK_VERSION = "1.0.0";
export class UrbaniqoClient {
    opts;
    constructor(options) {
        if (!options.agencyId)
            throw new Error("UrbaniqoClient: agencyId is required");
        if (!options.keyId)
            throw new Error("UrbaniqoClient: keyId is required");
        if (!options.secret)
            throw new Error("UrbaniqoClient: secret is required");
        this.opts = {
            agencyId: options.agencyId,
            keyId: options.keyId,
            secret: options.secret,
            baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ""),
            timeoutMs: options.timeoutMs ?? 15_000,
            retry: {
                attempts: options.retry?.attempts ?? 3,
                initialMs: options.retry?.initialMs ?? 250,
                maxMs: options.retry?.maxMs ?? 5_000,
            },
            fetch: options.fetch,
            now: options.now,
        };
    }
    /** Replace the agency catalog. Idempotent; tariffs not present are archived. */
    async upsertTariffs(tariffs) {
        return this.request("PUT", "/tariffs", { tariffs }, { idempotent: true });
    }
    /** Mark a single tariff inactive without re-uploading the whole catalog. */
    async archiveTariff(tariffId) {
        await this.request("POST", `/tariffs/${encodeURIComponent(tariffId)}/archive`, {}, { idempotent: true });
    }
    /** Refund a ticket. The customer is refunded on the original card. */
    async refundTicket(ticketId, reason) {
        return this.request("POST", `/tickets/${encodeURIComponent(ticketId)}/refund`, { reason }, { idempotent: true });
    }
    /** Record a validation event so the customer sees it live in Urbaniqo. */
    async recordValidation(ticketId, input) {
        await this.request("POST", `/tickets/${encodeURIComponent(ticketId)}/validations`, input, { idempotent: false });
    }
    /** Read a ticket envelope. */
    async getTicket(ticketId) {
        return this.request("GET", `/tickets/${encodeURIComponent(ticketId)}`, undefined, { idempotent: true });
    }
    /* ───────────────────────── Internals ───────────────────────── */
    async request(method, path, body, opts) {
        const attempts = opts.idempotent ? this.opts.retry.attempts : 1;
        let lastError;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await this.sendOnce(method, path, body, opts.idempotencyKey);
            }
            catch (err) {
                lastError = err;
                const retryable = err instanceof UrbaniqoTransportError ||
                    (err instanceof UrbaniqoApiError && err.isRetryable());
                if (!retryable || attempt === attempts)
                    throw err;
                await this.sleep(this.backoffMs(attempt));
            }
        }
        throw lastError;
    }
    async sendOnce(method, path, body, idempotencyKey) {
        const fullPath = `/api/transit/v1${path}`;
        const url = `${this.opts.baseUrl}${path}`;
        const bodyText = body === undefined || (method === "GET" || method === "DELETE")
            ? ""
            : JSON.stringify(body);
        const timestamp = Math.floor((this.opts.now?.() ?? Date.now()) / 1000);
        const canonical = canonicalRequest(method, fullPath, timestamp, bodyText);
        const signature = signCanonical(this.opts.secret, canonical);
        const headers = {
            "Authorization": `UrbaniqoTransit-HMAC-SHA256 Credential=${this.opts.agencyId}/${this.opts.keyId}, Signature=${signature}`,
            "X-Urbaniqo-Timestamp": String(timestamp),
            "User-Agent": `urbaniqo-sdk-node/${SDK_VERSION}`,
            "Accept": "application/json",
        };
        if (bodyText)
            headers["Content-Type"] = "application/json";
        if (idempotencyKey)
            headers["Idempotency-Key"] = idempotencyKey;
        const fetchImpl = this.opts.fetch ?? globalThis.fetch;
        if (!fetchImpl) {
            throw new UrbaniqoTransportError("No global fetch available. Use Node 18+ or pass `fetch` in client options.");
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);
        let res;
        try {
            res = await fetchImpl(url, {
                method,
                headers,
                body: bodyText || undefined,
                signal: controller.signal,
            });
        }
        catch (err) {
            throw new UrbaniqoTransportError(`Request to Urbaniqo failed: ${err?.message ?? String(err)}`, err);
        }
        finally {
            clearTimeout(timer);
        }
        const requestId = res.headers.get("X-Request-Id");
        if (res.ok) {
            if (res.status === 204)
                return undefined;
            const text = await res.text();
            return text ? JSON.parse(text) : undefined;
        }
        let problem;
        try {
            problem = (await res.json());
        }
        catch {
            problem = {
                title: res.statusText || `HTTP ${res.status}`,
                status: res.status,
                error_code: res.status === 429 ? "rate_limited" : "internal_error",
            };
        }
        throw new UrbaniqoApiError(res.status, problem, requestId);
    }
    backoffMs(attempt) {
        const base = this.opts.retry.initialMs * 2 ** (attempt - 1);
        const jittered = base * (0.75 + Math.random() * 0.5);
        return Math.min(jittered, this.opts.retry.maxMs);
    }
    sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }
}
//# sourceMappingURL=client.js.map