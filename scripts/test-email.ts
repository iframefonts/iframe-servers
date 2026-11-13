/** Sends one sample reminder to EMAIL_REDIRECT_TO (or the address given) to check Resend + the sender domain. */
import "dotenv/config";
import { createElement } from "react";
import { ReminderEmail } from "../src/emails/reminder-email";
import { getMailer } from "../src/lib/email/send";
import { env, mock } from "../src/lib/env";

async function main() {
  if (mock.email) throw new Error("RESEND_API_KEY is empty");
  const to = process.argv[2] || env.emailRedirectTo || env.adminEmail;
  const res = await getMailer().send({
    to: [to],
    subject: "Test: iFRAME Servers email works",
    react: createElement(ReminderEmail, {
      locale: "el",
      kind: "d30",
      domain: "example.gr",
      expiryDate: "31 Δεκεμβρίου 2026",
      amount: "148,80 €",
      payUrl: `${env.appUrl}/pay/test`,
      extras: ["Περιλαμβάνει και την ανανέωση του domain example.gr για 2 έτη."],
    }),
  });
  console.log(`Sent from ${env.emailFrom} to ${to}: ${res.id}`);
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
