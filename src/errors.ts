import type { ErrorCode, ProblemDetails } from "./types.js";

/**
 * Thrown when the SDK cannot reach Urbaniqo (DNS, TLS, timeout, …).
 * Distinct from `UrbaniqoApiError`, which is a well-formed error response.
 */
export class UrbaniqoTransportError extends Error {
    constructor(message: string, public cause?: unknown) {
        super(message);
        this.name = "UrbaniqoTransportError";
    }
}

/**
 * Thrown when Urbaniqo returns a non-2xx response. Carries the parsed
 * Problem Details body when available.
 */
export class UrbaniqoApiError extends Error {
    public readonly status: number;
    public readonly errorCode: ErrorCode;
    public readonly details: ProblemDetails;
    public readonly requestId: string | null;

    constructor(status: number, body: ProblemDetails, requestId: string | null = null) {
        super(`Urbaniqo API ${status} ${body.error_code}: ${body.title}${body.detail ? ` — ${body.detail}` : ""}`);
        this.name = "UrbaniqoApiError";
        this.status = status;
        this.errorCode = body.error_code;
        this.details = body;
        this.requestId = requestId;
    }

    /** True if a retry has any chance of succeeding (5xx or rate limited). */
    public isRetryable(): boolean {
        return this.status >= 500 || this.errorCode === "rate_limited";
    }
}

/** Thrown when a webhook signature does not verify or is stale. */
export class UrbaniqoWebhookError extends Error {
    constructor(public readonly reason: WebhookErrorReason, message: string) {
        super(message);
        this.name = "UrbaniqoWebhookError";
    }
}

export type WebhookErrorReason =
    | "missing_header"
    | "invalid_signature"
    | "stale_timestamp"
    | "malformed_body";
