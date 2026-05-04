// Convenience script: publishes a couple of demo tariffs to the (mock or real)
// Urbaniqo Transit API so you have something to buy in `send-test-purchase`.

import { UrbaniqoClient } from "urbaniqo-sdk-js";

const urbaniqo = new UrbaniqoClient({
    agencyId: process.env.URBANIQO_AGENCY_ID ?? "agency-test",
    keyId:    process.env.URBANIQO_KEY_ID    ?? "key-test",
    secret:   process.env.URBANIQO_SECRET    ?? "test-secret-test-secret-test-secret-test-secret-test-secret-test",
    baseUrl:  process.env.URBANIQO_BASE_URL  ?? "http://localhost:4080/api/transit/v1",
});

const result = await urbaniqo.upsertTariffs([
    {
        id: "atm-urban-90",
        name: { en: "Urban 90′", it: "Urbano 90′" },
        kind: "single_ride",
        fare_cents: 220,
        currency: "EUR",
        zones: ["Mi1", "Mi3"],
        default_validity_seconds: 90 * 60,
        activation_mode: "on_first_scan",
        is_active: true,
    },
    {
        id: "atm-weekly",
        name: { en: "Weekly Pass", it: "Abbonamento Settimanale" },
        kind: "time_pass",
        fare_cents: 1700,
        currency: "EUR",
        is_active: true,
    },
]);

console.log("Catalog published:", result);
