/**
 * urbaniqo-sdk-js
 *
 * Official SDK for the Urbaniqo Transit protocol — v1.
 * See https://github.com/regnatech/urbaniqo-sdk-js for docs.
 */
export { UrbaniqoClient } from "./client.js";
export type { UrbaniqoClientOptions, RetryOptions } from "./client.js";
export { verifyWebhook, createWebhookDispatcher, } from "./webhooks.js";
export type { VerifyWebhookOptions, HeadersLike, WebhookHandler, EventHandlers, } from "./webhooks.js";
export { UrbaniqoApiError, UrbaniqoTransportError, UrbaniqoWebhookError, } from "./errors.js";
export type { WebhookErrorReason } from "./errors.js";
export type { Tariff, TariffKind, ActivationMode, BarcodeFormat, LocalizedText, Ticket, UpsertTariffsResult, RecordValidationInput, RefundReason, WebhookEvent, WebhookPayload, PurchaseRequestedData, PurchaseRequestedResponse, PurchaseRefundedData, TicketExpiredData, ErrorCode, ProblemDetails, } from "./types.js";
export { canonicalRequest, signCanonical, sha256Hex, safeEqualHex } from "./auth.js";
//# sourceMappingURL=index.d.ts.map