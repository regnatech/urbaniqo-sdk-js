/**
 * Thrown when the SDK cannot reach Urbaniqo (DNS, TLS, timeout, …).
 * Distinct from `UrbaniqoApiError`, which is a well-formed error response.
 */
export class UrbaniqoTransportError extends Error {
    cause;
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.name = "UrbaniqoTransportError";
    }
}
/**
 * Thrown when Urbaniqo returns a non-2xx response. Carries the parsed
 * Problem Details body when available.
 */
export class UrbaniqoApiError extends Error {
    status;
    errorCode;
    details;
    requestId;
    constructor(status, body, requestId = null) {
        super(`Urbaniqo API ${status} ${body.error_code}: ${body.title}${body.detail ? ` — ${body.detail}` : ""}`);
        this.name = "UrbaniqoApiError";
        this.status = status;
        this.errorCode = body.error_code;
        this.details = body;
        this.requestId = requestId;
    }
    /** True if a retry has any chance of succeeding (5xx or rate limited). */
    isRetryable() {
        return this.status >= 500 || this.errorCode === "rate_limited";
    }
}
/** Thrown when a webhook signature does not verify or is stale. */
export class UrbaniqoWebhookError extends Error {
    reason;
    constructor(reason, message) {
        super(message);
        this.reason = reason;
        this.name = "UrbaniqoWebhookError";
    }
}
//# sourceMappingURL=errors.js.map