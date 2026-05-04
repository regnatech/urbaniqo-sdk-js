/**
 * Public types for the Urbaniqo Transit protocol — v1.
 * See ../docs/protocol.md for the wire-level spec.
 */
export type TariffKind = "single_ride" | "multi_ride" | "time_pass";
export type ActivationMode = "on_purchase" | "on_first_scan";
export type BarcodeFormat = "qrcode" | "code128" | "code39" | "ean13" | "ean8" | "pdf417" | "aztec" | "datamatrix" | "text";
export type RefundReason = "customer_request" | "service_disruption" | "agency_error" | "fraud_suspected";
export type WebhookEvent = "purchase.requested" | "purchase.refunded" | "ticket.expired";
/** A `name` / `description` field as a `{bcp47: text}` map; `en` is required. */
export interface LocalizedText {
    en: string;
    [locale: string]: string;
}
export interface Tariff {
    id: string;
    name: LocalizedText;
    description?: LocalizedText;
    kind: TariffKind;
    fare_cents: number;
    currency: "EUR";
    zones?: string[];
    default_validity_seconds?: number;
    activation_mode?: ActivationMode;
    rides_total?: number | null;
    is_active: boolean;
    metadata?: Record<string, unknown>;
}
export interface UpsertTariffsResult {
    applied_at: string;
    active_count: number;
    archived_count: number;
}
export interface Ticket {
    id: string;
    order_id: string;
    tariff_id: string;
    user_ref: string;
    code: string;
    format: BarcodeFormat;
    valid_from: string;
    valid_until: string;
    rides_total: number | null;
    rides_remaining: number | null;
    issued_at: string;
    refunded_at: string | null;
    metadata: Record<string, unknown>;
}
export interface RecordValidationInput {
    validated_at: string;
    station_id?: string;
    validator_id?: string;
    metadata?: Record<string, unknown>;
}
export interface PurchaseRequestedData {
    order_id: string;
    tariff_id: string;
    user_ref: string;
    fare_cents: number;
    currency: "EUR";
    requested_at: string;
}
export interface PurchaseRefundedData {
    ticket_id: string;
    order_id: string;
    tariff_id: string;
    user_ref: string;
    refund_id: string;
    amount_cents: number;
    currency: "EUR";
    reason: RefundReason;
    refunded_at: string;
}
export interface TicketExpiredData {
    ticket_id: string;
    tariff_id: string;
    expired_at: string;
}
export type WebhookPayload = {
    event: "purchase.requested";
    delivery_id: string;
    created_at: string;
    data: PurchaseRequestedData;
} | {
    event: "purchase.refunded";
    delivery_id: string;
    created_at: string;
    data: PurchaseRefundedData;
} | {
    event: "ticket.expired";
    delivery_id: string;
    created_at: string;
    data: TicketExpiredData;
};
/** What the agency MUST return synchronously to a `purchase.requested` webhook. */
export interface PurchaseRequestedResponse {
    code: string;
    format: BarcodeFormat;
    valid_from: string;
    valid_until: string;
    rides_total?: number | null;
    metadata?: Record<string, unknown>;
}
/** Error code returned in the `error_code` field of a Problem Details body. */
export type ErrorCode = "invalid_signature" | "expired_timestamp" | "revoked_key" | "invalid_payload" | "tariff_not_found" | "ticket_not_found" | "ticket_already_refunded" | "sold_out" | "rate_limited" | "internal_error";
export interface ProblemDetails {
    type?: string;
    title: string;
    status: number;
    detail?: string;
    error_code: ErrorCode;
    instance?: string;
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map