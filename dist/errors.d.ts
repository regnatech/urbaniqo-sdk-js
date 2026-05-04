import type { ErrorCode, ProblemDetails } from "./types.js";
/**
 * Thrown when the SDK cannot reach Urbaniqo (DNS, TLS, timeout, …).
 * Distinct from `UrbaniqoApiError`, which is a well-formed error response.
 */
export declare class UrbaniqoTransportError extends Error {
    cause?: unknown | undefined;
    constructor(message: string, cause?: unknown | undefined);
}
/**
 * Thrown when Urbaniqo returns a non-2xx response. Carries the parsed
 * Problem Details body when available.
 */
export declare class UrbaniqoApiError extends Error {
    readonly status: number;
    readonly errorCode: ErrorCode;
    readonly details: ProblemDetails;
    readonly requestId: string | null;
    constructor(status: number, body: ProblemDetails, requestId?: string | null);
    /** True if a retry has any chance of succeeding (5xx or rate limited). */
    isRetryable(): boolean;
}
/** Thrown when a webhook signature does not verify or is stale. */
export declare class UrbaniqoWebhookError extends Error {
    readonly reason: WebhookErrorReason;
    constructor(reason: WebhookErrorReason, message: string);
}
export type WebhookErrorReason = "missing_header" | "invalid_signature" | "stale_timestamp" | "malformed_body";
//# sourceMappingURL=errors.d.ts.map