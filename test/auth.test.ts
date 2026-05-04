import { describe, expect, it } from "vitest";
import { canonicalRequest, sha256Hex, signCanonical, safeEqualHex } from "../src/auth.js";

describe("auth: canonical request", () => {
    it("hashes empty body to the well-known SHA-256 of empty string", () => {
        expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    });

    it("locks down the canonical layout", () => {
        const c = canonicalRequest("post", "/api/transit/v1/tariffs", 1700000000, '{"a":1}');
        // line 1: method UPPERCASED
        // line 2: path verbatim
        // line 3: timestamp
        // line 4: hex sha256 of body
        const expectedHash = sha256Hex('{"a":1}');
        expect(c).toBe(`POST\n/api/transit/v1/tariffs\n1700000000\n${expectedHash}`);
    });

    it("produces a deterministic signature for fixed inputs", () => {
        // Same inputs → same signature (this is the load-bearing property
        // both sides of the protocol depend on).
        const a = signCanonical("test-secret", "POST\n/x\n1700000000\nabc");
        const b = signCanonical("test-secret", "POST\n/x\n1700000000\nabc");
        expect(a).toBe(b);
        // Hex, 64 chars (SHA-256 output)
        expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("changes output when any input changes", () => {
        const base = signCanonical("s", "POST\n/x\n1700000000\nabc");
        expect(signCanonical("s", "POST\n/x\n1700000001\nabc")).not.toBe(base);
        expect(signCanonical("s", "POST\n/y\n1700000000\nabc")).not.toBe(base);
        expect(signCanonical("s", "POST\n/x\n1700000000\nabd")).not.toBe(base);
        expect(signCanonical("s2", "POST\n/x\n1700000000\nabc")).not.toBe(base);
    });
});

describe("auth: safeEqualHex", () => {
    it("returns true for identical strings", () => {
        expect(safeEqualHex("deadbeef", "deadbeef")).toBe(true);
    });

    it("returns false for different lengths", () => {
        expect(safeEqualHex("deadbeef", "deadbeefcafe")).toBe(false);
    });

    it("returns false for different content of same length", () => {
        expect(safeEqualHex("deadbeef", "deadbe00")).toBe(false);
    });

    it("returns false on non-hex input", () => {
        expect(safeEqualHex("not-hex!", "not-hex!")).toBe(false);
    });
});
