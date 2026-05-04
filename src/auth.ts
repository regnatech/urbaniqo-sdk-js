import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Build the canonical string used in the v1 HMAC signature.
 * See protocol.md §3.1.
 */
export function canonicalRequest(
    method: string,
    path: string,
    timestamp: number,
    body: string | Uint8Array,
): string {
    const bodyHash = sha256Hex(body);
    return `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
}

export function sha256Hex(data: string | Uint8Array): string {
    return createHash("sha256").update(data).digest("hex");
}

export function signCanonical(secret: string, canonical: string): string {
    return createHmac("sha256", secret).update(canonical).digest("hex");
}

/**
 * Constant-time hex comparison. Returns false on length mismatch instead of
 * throwing — caller decides whether to surface that.
 */
export function safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let bufA: Buffer, bufB: Buffer;
    try {
        bufA = Buffer.from(a, "hex");
        bufB = Buffer.from(b, "hex");
    } catch {
        return false;
    }
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return timingSafeEqual(bufA, bufB);
}
