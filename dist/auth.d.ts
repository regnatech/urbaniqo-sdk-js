/**
 * Build the canonical string used in the v1 HMAC signature.
 * See protocol.md §3.1.
 */
export declare function canonicalRequest(method: string, path: string, timestamp: number, body: string | Uint8Array): string;
export declare function sha256Hex(data: string | Uint8Array): string;
export declare function signCanonical(secret: string, canonical: string): string;
/**
 * Constant-time hex comparison. Returns false on length mismatch instead of
 * throwing — caller decides whether to surface that.
 */
export declare function safeEqualHex(a: string, b: string): boolean;
//# sourceMappingURL=auth.d.ts.map