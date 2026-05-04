# Supported barcode formats

The `format` field returned with each issued ticket tells the Urbaniqo app **how to render the code** in the customer's wallet. It does NOT influence what your validators read — that's whatever your existing scanners already understand.

| `format`     | Type | Typical use | Max payload | Renderer used in Urbaniqo |
|---|---|---|---|---|
| `qrcode`     | 2D Matrix | Default for everything modern. Encodes any UTF-8 string. | ~4 KB | QR Code (ISO/IEC 18004), error correction `M` |
| `pdf417`     | 2D Stacked | Legacy gates that read PDF417 (some regional rail). | ~1.1 KB | PDF417, error correction level 4 |
| `aztec`      | 2D Matrix | Compact alternative to QR; some metro turnstiles. | ~3 KB | Aztec |
| `datamatrix` | 2D Matrix | Industrial scanners. | ~2 KB | Data Matrix, ECC 200 |
| `ean13`      | 1D | Older bus farebox systems. **Numeric only**, exactly 12 digits + check digit (the SDK adds the check digit if you supply 12). | 13 chars | EAN-13 |
| `ean8`       | 1D | Same as above, smaller. **Numeric only**, exactly 7 digits + check digit. | 8 chars | EAN-8 |
| `code128`    | 1D | High-density 1D, supports full ASCII. | ~80 chars | Code 128 (Auto subset) |
| `code39`     | 1D | Legacy. Uppercase letters, digits and a few symbols only. | ~40 chars | Code 39 |
| `text`       | None | "Just show me the code as text" — useful for SMS-based or vending-machine-style tickets. | ~2 KB | Monospace, large font, copy-to-clipboard tap |

## Choosing a format

For most agencies, return `qrcode` and forget about the rest:

- It encodes anything (binary-safe via UTF-8 / Base64),
- Error correction is good enough for a phone screen at any zoom level,
- All of the major validation hardware on the Italian market reads QR.

Pick something else only if your existing turnstiles **cannot read QR** and you'd have to retrofit.

## Validity rules

| Format | Allowed character set | Length |
|---|---|---|
| `qrcode`, `pdf417`, `aztec`, `datamatrix`, `text` | Any UTF-8 (we encode bytes faithfully) | Up to 4 KB |
| `ean13` | `0-9` only | 12 or 13 digits (we add the check digit if 12) |
| `ean8`  | `0-9` only | 7 or 8 digits |
| `code128` | Printable ASCII (`0x20`–`0x7E`) | Up to 80 chars |
| `code39` | `A-Z`, `0-9`, `-`, `.`, `space`, `$`, `/`, `+`, `%` | Up to 40 chars |

Violating these returns a `purchase.failed` to the customer with `error_code = invalid_payload` (you'll see it in your dashboard). The SDK won't catch the violation — the protocol contract enforces it server-side.

## Display behaviour in the Urbaniqo app

- **`qrcode` / `aztec` / `datamatrix`**: shown full-screen on tap. Auto-brightens. Stays on while the ticket is "active".
- **`pdf417`**: same, in landscape orientation (PDF417 is wider than tall).
- **`ean13` / `ean8` / `code128` / `code39`**: rendered with quiet zones; tap to enlarge.
- **`text`**: rendered in a 3xl monospace, with a "Copy" button.

## What about RFID / NFC?

Out of scope for v1. NFC validation requires a different cryptographic handshake (typically MIFARE DESFire AID lookup), which is wallet-specific and not something Urbaniqo can act as a generic relay for. Talk to us if this matters for your network — we've drafted a `nfc-aid` extension for v1.1.
