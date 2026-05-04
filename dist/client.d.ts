import type { RecordValidationInput, RefundReason, Tariff, Ticket, UpsertTariffsResult } from "./types.js";
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
export declare class UrbaniqoClient {
    private readonly opts;
    constructor(options: UrbaniqoClientOptions);
    /** Replace the agency catalog. Idempotent; tariffs not present are archived. */
    upsertTariffs(tariffs: Tariff[]): Promise<UpsertTariffsResult>;
    /** Mark a single tariff inactive without re-uploading the whole catalog. */
    archiveTariff(tariffId: string): Promise<void>;
    /** Refund a ticket. The customer is refunded on the original card. */
    refundTicket(ticketId: string, reason: RefundReason): Promise<Ticket>;
    /** Record a validation event so the customer sees it live in Urbaniqo. */
    recordValidation(ticketId: string, input: RecordValidationInput): Promise<void>;
    /** Read a ticket envelope. */
    getTicket(ticketId: string): Promise<Ticket>;
    private request;
    private sendOnce;
    private backoffMs;
    private sleep;
}
//# sourceMappingURL=client.d.ts.map