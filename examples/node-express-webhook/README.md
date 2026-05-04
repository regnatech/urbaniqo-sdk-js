# Node + Express webhook example

Minimal agency-side webhook handler using `urbaniqo-sdk-js`. Exercises:

- HMAC signature verification on inbound `purchase.requested`
- Synchronous response with the issued ticket code
- Idempotent re-delivery (in-memory cache; swap for Redis in production)
- Outbound calls back into Urbaniqo (refund, validation events) — for completeness

## Run end-to-end against the mock

In three terminals:

```bash
# 1. Mock Urbaniqo (port 4080)
cd ../mock-urbaniqo-server && npm install && npm start

# 2. Agency webhook handler (port 3000)
cd ../node-express-webhook && npm install && npm start

# 3. Push a couple of tariffs to the mock, then trigger a fake purchase
node publish-catalog.js
curl -X POST http://localhost:4080/admin/send-purchase \
     -H 'Content-Type: application/json' \
     -d '{"tariff_id": "atm-urban-90"}'
```

You should see the mock print your handler's response and create a ticket record.

## Pointing at production

```bash
URBANIQO_BASE_URL=https://urbaniqo.com/api/transit/v1 \
URBANIQO_AGENCY_ID=… URBANIQO_KEY_ID=… URBANIQO_SECRET=… \
URBANIQO_WEBHOOK_SECRET=… \
npm start
```
