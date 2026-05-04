import { createHash, createHmac, timingSafeEqual } from "node:crypto";
/**
 * Build the canonical string used in the v1 HMAC signature.
 * See protocol.md §3.1.
 */
export function canonicalRequest(method, path, timestamp, body) {
    const bodyHash = sha256Hex(body);
    return `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
}
export function sha256Hex(data) {
    return createHash("sha256").update(data).digest("hex");
}
export function signCanonical(secret, canonical) {
    return createHmac("sha256", secret).update(canonical).digest("hex");
}
/**
 * Constant-time hex comparison. Returns false on length mismatch instead of
 * throwing — caller decides whether to surface that.
 */
export function safeEqualHex(a, b) {
    if (a.length !== b.length)
        return false;
    let bufA, bufB;
    try {
        bufA = Buffer.from(a, "hex");
        bufB = Buffer.from(b, "hex");
    }
    catch {
        return false;
    }
    if (bufA.length !== bufB.length || bufA.length === 0)
        return false;
    return timingSafeEqual(bufA, bufB);
}
//# sourceMappingURL=auth.js.map