import { canonicalRequest, signCanonical } from "./auth.js";
import { UrbaniqoApiError, UrbaniqoTransportError } from "./errors.js";
import type {
    ProblemDetails,
    RecordValidationInput,
    RefundReason,
    Tariff,
    Ticket,
    UpsertTariffsResult,
} from "./types.js";

export interface UrbaniqoClientOptions {
    agencyId: string;
    keyId: string;
    secret: string;
    /** Override the API host. Defaults to the production endpoint. */
    baseUrl?: string;
    /** Per-request timeout in ms. Default 15_000. */
    timeoutMs?: number;
    /** Retry policy for idempotent requests. Default: 3 attempts, capped 5s backoff. */
    retry?: RetryOptions;
    /** Custom fetch — useful for tests or non-Node runtimes. */
    fetch?: typeof fetch;
    /** Override "now" — useful in tests. */
    now?: () => number;
}

export interface RetryOptions {
    /** Total attempts including the first. 1 = no retries. Default 3. */
    attempts?: number;
    /** Initial backoff in ms. Default 250. */
    initialMs?: number;
    /** Cap on each individual backoff in ms. Default 5_000. */
    maxMs?: number;
}

const DEFAULT_BASE_URL = "https://urbaniqo.com/api/transit/v1";
const SDK_VERSION = "1.0.0";

export class UrbaniqoClient {
    private readonly opts: Required<Omit<UrbaniqoClientOptions, "retry" | "fetch" | "now">> &
        Pick<UrbaniqoClientOptions, "fetch" | "now"> & { retry: Required<RetryOptions> };

    constructor(options: UrbaniqoClientOptions) {
        if (!options.agencyId) throw new Error("UrbaniqoClient: agencyId is required");
        if (!options.keyId) throw new Error("UrbaniqoClient: keyId is required");
        if (!options.secret) throw new Error("UrbaniqoClient: secret is required");

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
    public async upsertTariffs(tariffs: Tariff[]): Promise<UpsertTariffsResult> {
        return this.request<UpsertTariffsResult>("PUT", "/tariffs", { tariffs }, { idempotent: true });
    }

    /** Mark a single tariff inactive without re-uploading the whole catalog. */
    public async archiveTariff(tariffId: string): Promise<void> {
        await this.request<void>("POST", `/tariffs/${encodeURIComponent(tariffId)}/archive`, {}, { idempotent: true });
    }

    /** Refund a ticket. The customer is refunded on the original card. */
    public async refundTicket(ticketId: string, reason: RefundReason): Promise<Ticket> {
        return this.request<Ticket>(
            "POST",
            `/tickets/${encodeURIComponent(ticketId)}/refund`,
            { reason },
            { idempotent: true },
        );
    }

    /** Record a validation event so the customer sees it live in Urbaniqo. */
    public async recordValidation(ticketId: string, input: RecordValidationInput): Promise<void> {
        await this.request<void>(
            "POST",
            `/tickets/${encodeURIComponent(ticketId)}/validations`,
            input,
            { idempotent: false },
        );
    }

    /** Read a ticket envelope. */
    public async getTicket(ticketId: string): Promise<Ticket> {
        return this.request<Ticket>("GET", `/tickets/${encodeURIComponent(ticketId)}`, undefined, { idempotent: true });
    }

    /* ───────────────────────── Internals ───────────────────────── */

    private async request<T>(
        method: string,
        path: string,
        body: unknown,
        opts: { idempotent: boolean; idempotencyKey?: string },
    ): Promise<T> {
        const attempts = opts.idempotent ? this.opts.retry.attempts : 1;
        let lastError: unknown;

        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                return await this.sendOnce<T>(method, path, body, opts.idempotencyKey);
            } catch (err) {
                lastError = err;
                const retryable =
                    err instanceof UrbaniqoTransportError ||
                    (err instanceof UrbaniqoApiError && err.isRetryable());
                if (!retryable || attempt === attempts) throw err;
                await this.sleep(this.backoffMs(attempt));
            }
        }
        throw lastError;
    }

    private async sendOnce<T>(
        method: string,
        path: string,
        body: unknown,
        idempotencyKey: string | undefined,
    ): Promise<T> {
        const fullPath = `/api/transit/v1${path}`;
        const url = `${this.opts.baseUrl}${path}`;

        const bodyText =
            body === undefined || (method === "GET" || method === "DELETE")
                ? ""
                : JSON.stringify(body);

        const timestamp = Math.floor((this.opts.now?.() ?? Date.now()) / 1000);
        const canonical = canonicalRequest(method, fullPath, timestamp, bodyText);
        const signature = signCanonical(this.opts.secret, canonical);

        const headers: Record<string, string> = {
            "Authorization": `UrbaniqoTransit-HMAC-SHA256 Credential=${this.opts.agencyId}/${this.opts.keyId}, Signature=${signature}`,
            "X-Urbaniqo-Timestamp": String(timestamp),
            "User-Agent": `urbaniqo-sdk-node/${SDK_VERSION}`,
            "Accept": "application/json",
        };
        if (bodyText) headers["Content-Type"] = "application/json";
        if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

        const fetchImpl = this.opts.fetch ?? globalThis.fetch;
        if (!fetchImpl) {
            throw new UrbaniqoTransportError(
                "No global fetch available. Use Node 18+ or pass `fetch` in client options.",
            );
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

        let res: Response;
        try {
            res = await fetchImpl(url, {
                method,
                headers,
                body: bodyText || undefined,
                signal: controller.signal,
            });
        } catch (err) {
            throw new UrbaniqoTransportError(
                `Request to Urbaniqo failed: ${(err as Error)?.message ?? String(err)}`,
                err,
            );
        } finally {
            clearTimeout(timer);
        }

        const requestId = res.headers.get("X-Request-Id");
        if (res.ok) {
            if (res.status === 204) return undefined as T;
            const text = await res.text();
            return text ? (JSON.parse(text) as T) : (undefined as T);
        }

        let problem: ProblemDetails;
        try {
            problem = (await res.json()) as ProblemDetails;
        } catch {
            problem = {
                title: res.statusText || `HTTP ${res.status}`,
                status: res.status,
                error_code: res.status === 429 ? "rate_limited" : "internal_error",
            };
        }
        throw new UrbaniqoApiError(res.status, problem, requestId);
    }

    private backoffMs(attempt: number): number {
        const base = this.opts.retry.initialMs * 2 ** (attempt - 1);
        const jittered = base * (0.75 + Math.random() * 0.5);
        return Math.min(jittered, this.opts.retry.maxMs);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((r) => setTimeout(r, ms));
    }
}
