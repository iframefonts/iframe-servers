/** Server-side configuration. Empty provider keys switch that provider to mock mode. */
const e = process.env;

export const env = {
  appUrl: (e.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  sessionSecret: e.SESSION_SECRET ?? "",
  allowedEmails: (e.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  adminEmail: e.ADMIN_EMAIL ?? "info@iframe.gr",
  emailFrom: e.EMAIL_FROM ?? "iFRAME Billing <billing@iframe.gr>",
  /** Where client replies go ("Details wrong? Reply to this email"). */
  emailReplyTo: e.EMAIL_REPLY_TO ?? "info@iframe.gr",
  cronSecret: e.CRON_SECRET ?? "",
  resendKey: e.RESEND_API_KEY ?? "",
  /** Dev safety: when set, every email goes to this address instead of the real recipients. */
  emailRedirectTo: e.EMAIL_REDIRECT_TO ?? "",
  viva: {
    env: (e.VIVA_ENV ?? "demo") as "demo" | "live",
    clientId: e.VIVA_CLIENT_ID ?? "",
    clientSecret: e.VIVA_CLIENT_SECRET ?? "",
    sourceCode: e.VIVA_SOURCE_CODE ?? "",
    merchantId: e.VIVA_MERCHANT_ID ?? "",
    apiKey: e.VIVA_API_KEY ?? "",
  },
  elorus: { token: e.ELORUS_TOKEN ?? "", orgId: e.ELORUS_ORG_ID ?? "" },
  inngestEnabled: Boolean(e.INNGEST_EVENT_KEY || e.INNGEST_DEV),
};

export const mock = {
  email: !env.resendKey,
  viva: !env.viva.clientId,
  elorus: !env.elorus.token,
};

/** The simulated Viva checkout records real payments, so it never runs in production. */
export const testCheckoutAllowed = mock.viva && (process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_CHECKOUT === "1");
