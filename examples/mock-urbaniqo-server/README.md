# Mock Urbaniqo Transit server

A local stand-in for the Urbaniqo Transit API. Lets you exercise the SDKs end-to-end without going through production.

## Run

```bash
cd examples/mock-urbaniqo-server
npm install
npm start
```

Default credentials are printed at startup. Point your SDK's `baseUrl` to the printed URL (`http://localhost:4080/api/transit/v1` by default).

## Override credentials

```bash
AGENCY_ID=my-agency \
KEY_ID=my-key \
AGENCY_SECRET=$(openssl rand -hex 32) \
AGENCY_WEBHOOK_SECRET=$(openssl rand -hex 32) \
AGENCY_WEBHOOK_URL=http://localhost:3000/webhooks/urbaniqo \
npm start
```

## Simulate a purchase

After your SDK has called `upsertTariffs([...])` against the mock, trigger a `purchase.requested` webhook to your handler:

```bash
curl -X POST http://localhost:4080/admin/send-purchase \
     -H 'Content-Type: application/json' \
     -d '{"tariff_id": "atm-urban-90"}'
```

The mock prints what your handler returned and stores the resulting ticket in memory so you can also test refund/get/validation calls against it.

## What the mock validates

- HMAC-SHA256 signature on every request (using the printed `AGENCY_SECRET`).
- Timestamp drift (rejects > 300 s).
- Tariff/ticket existence on read endpoints.

What it does NOT do (intentionally):

- Persist anything across restarts.
- Enforce rate limits.
- Talk to Stripe / a payment processor.

It's a contract-conformance harness, not a real Urbaniqo.
