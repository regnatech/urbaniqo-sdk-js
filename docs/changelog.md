# Changelog

All notable changes to the protocol and the two SDKs are documented here. Each entry follows the format **(protocol-version, sdk-version)**.

## [v1, 1.0.0] — 2026-05-04

Initial public release.

- Protocol v1: tariff catalog, `purchase.requested` (sync), `purchase.refunded`, `ticket.expired`, refund + validation endpoints.
- HMAC-SHA256 request and webhook signing.
- Multi-day validity: no upper bound on `valid_until`.
- Three tariff kinds: `single_ride`, `multi_ride`, `time_pass`.
- Nine barcode formats (QR, PDF417, Aztec, Data Matrix, EAN-13/8, Code 128, Code 39, plain text).
- `urbaniqo-sdk-js` 1.0.0 — Node ≥ 18, TypeScript, zero deps.
- `regna/urbaniqo-sdk` 1.0.0 — PHP ≥ 8.2, PSR-18 BYO-client.
