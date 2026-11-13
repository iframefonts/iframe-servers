import "dotenv/config";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Force every provider into mock mode in tests: never call live services.
for (const k of ["RESEND_API_KEY", "VIVA_CLIENT_ID", "ELORUS_TOKEN", "INNGEST_EVENT_KEY", "INNGEST_DEV", "ELORUS_ORG_ID", "ELORUS_DOCTYPE_TPY", "ELORUS_DOCTYPE_APY", "ELORUS_DOCTYPE_EU", "ELORUS_DOCTYPE_NON_EU", "ELORUS_TAX_VAT24", "ELORUS_TAX_VAT0"]) delete process.env[k];
