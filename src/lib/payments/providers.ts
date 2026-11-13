import { db } from "@/lib/db";
import { env, mock, testCheckoutAllowed } from "@/lib/env";
import type { Locale } from "@/lib/i18n";

type PR = { id: string; token: string; amountCents: number };
type Ctx = { pr: PR; description: string; email?: string; customerName: string; locale: Locale };

const payUrl = (token: string, path = "") => `${env.appUrl}/pay/${token}${path}`;

// ---------- Viva Smart Checkout ----------

const viva = {
  accounts: () => (env.viva.env === "live" ? "https://accounts.vivapayments.com" : "https://demo-accounts.vivapayments.com"),
  api: () => (env.viva.env === "live" ? "https://api.vivapayments.com" : "https://demo-api.vivapayments.com"),
  web: () => (env.viva.env === "live" ? "https://www.vivapayments.com" : "https://demo.vivapayments.com"),
};

let vivaToken: { value: string; exp: number } | null = null;
async function vivaAccessToken(): Promise<string> {
  if (vivaToken && vivaToken.exp > Date.now() + 60_000) return vivaToken.value;
  const res = await fetch(`${viva.accounts()}/connect/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.viva.clientId}:${env.viva.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Viva token: ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  vivaToken = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return vivaToken.value;
}

export async function startVivaCheckout({ pr, description, email, customerName, locale }: Ctx): Promise<string> {
  if (mock.viva) {
    if (!testCheckoutAllowed) throw new Error("Viva is not configured (VIVA_CLIENT_ID is empty)");
    return payUrl(pr.token, "/mock?provider=viva");
  }
  const res = await fetch(`${viva.api()}/checkout/v2/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await vivaAccessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: pr.amountCents,
      customerTrns: description,
      customer: { email, fullName: customerName, requestLang: locale === "el" ? "el-GR" : "en-GB" },
      sourceCode: env.viva.sourceCode,
      merchantTrns: pr.id,
      paymentTimeout: 3600,
      allowRecurring: false,
    }),
  });
  if (!res.ok) throw new Error(`Viva create order: ${res.status} ${await res.text()}`);
  const { orderCode } = (await res.json()) as { orderCode: number };
  await db.paymentRequest.update({ where: { id: pr.id }, data: { vivaOrderCode: String(orderCode) } });
  return `${viva.web()}/web/checkout?ref=${orderCode}`;
}

export async function cancelVivaOrder(orderCode: string | null) {
  if (!orderCode || mock.viva) return;
  await fetch(`${viva.api()}/api/orders/${orderCode}`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${Buffer.from(`${env.viva.merchantId}:${env.viva.apiKey}`).toString("base64")}` },
  }).catch(() => undefined);
}

/** Viva verifies the webhook URL with a GET; we answer with the key from "Retrieve webhook key". */
export async function vivaWebhookKey(): Promise<string> {
  const res = await fetch(`${viva.web()}/api/messages/config/token`, {
    headers: { Authorization: `Basic ${Buffer.from(`${env.viva.merchantId}:${env.viva.apiKey}`).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`Viva webhook key: ${res.status}`);
  return ((await res.json()) as { Key: string }).Key;
}

/** Re-fetch the transaction from Viva before trusting a webhook. */
export async function vivaTransaction(transactionId: string) {
  const res = await fetch(`${viva.api()}/checkout/v2/transactions/${transactionId}`, {
    headers: { Authorization: `Bearer ${await vivaAccessToken()}` },
  });
  if (!res.ok) throw new Error(`Viva transaction ${transactionId}: ${res.status}`);
  return (await res.json()) as { orderCode: number; statusId: string; amount: number; merchantTrns?: string; insDate?: string };
}

export async function providerHealth() {
  const out: Record<string, "mock" | "ok" | "error"> = {};
  out.viva = mock.viva ? "mock" : await vivaAccessToken().then(() => "ok" as const, () => "error" as const);
  return out;
}
