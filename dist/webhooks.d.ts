import type { WebhookEvent, WebhookPayload } from "./types.js";
export interface VerifyWebhookOptions {
    /** Raw request body — must be the bytes received over the wire, not re-serialized JSON. */
    rawBody: string | Uint8Array;
    /** Map of HTTP headers; lookups are case-insensitive. */
    headers: HeadersLike;
    /** Webhook secret from the agency dashboard. */
    secret: string;
    /** Allowed clock drift in seconds (default 300). */
    toleranceSeconds?: number;
    /** Override "now" — useful in tests. Unix seconds. */
    now?: () => number;
}
export type HeadersLike = Record<string, string | string[] | undefined> | {
    get(name: string): string | null;
};
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
export declare function verifyWebhook(opts: VerifyWebhookOptions): WebhookPayload;
export type WebhookHandler<T extends WebhookPayload = WebhookPayload> = (payload: T) => Promise<unknown> | unknown;
export type EventHandlers = {
    [E in WebhookEvent]?: WebhookHandler<Extract<WebhookPayload, {
        event: E;
    }>>;
};
/**
 * Builds a strongly-typed dispatcher for a set of webhook events. Returns
 * the raw return value of the matched handler — caller decides how to
 * encode it (e.g. JSON.stringify for `purchase.requested`).
 */
export declare function createWebhookDispatcher(handlers: EventHandlers): (payload: WebhookPayload) => Promise<unknown>;
//# sourceMappingURL=webhooks.d.ts.map