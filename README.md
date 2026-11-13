# iFRAME Servers

iFRAME's internal app for hosting renewals. It keeps each client's hosting packages, emails the client 30, 7 and 1 day before expiry with a pay link, takes the payment with Viva, then issues and emails the invoice through Elorus.

## Run it locally

Requirements: Node 22, pnpm, PostgreSQL.

```bash
pnpm install
cp .env.example .env          # set DATABASE_URL and SESSION_SECRET (openssl rand -hex 32)
pnpm db:migrate
pnpm db:seed                  # optional demo data
pnpm dev
```

Sign in at http://localhost:3000/login with an address listed in `ALLOWED_EMAILS`. With no `RESEND_API_KEY`, the sign-in link is shown on the page instead of emailed.

**Test mode:** any provider whose keys are empty is simulated. That covers Viva (a test checkout page), Elorus (in-memory contacts and invoices) and email (logged to the console). A banner at the top of the app shows which ones are simulated.

## Import the current renewals sheet

```bash
pnpm import:sheet path/to/Sheet1.html --dry-run   # preview
pnpm import:sheet path/to/Sheet1.html
```

The import creates one client, website and package per domain. Each package expires at the end of its sheet month, with **reminders paused and no price**. After the import:

1. Link each client to Elorus. Use Today › "clients not linked", or Clients › "Not linked to Elorus".
2. Set each package's plan or a custom price. Use Renewals › "Needs setup".
3. Resume reminders on the package page.

## Going live

The app runs at **https://webhosting.iframe.gr**. iframe.gr's DNS is on **Cloudflare**. Cloudflare delegates `webhosting.iframe.gr` to Plesk (two NS records, `webhosting` → `ns32571.grserver.gr` and `ns32572.grserver.gr`), so the app's records live in the **Plesk** zone for webhosting.iframe.gr.

0. **Domain:** `webhosting.iframe.gr` is added to the Vercel project. In the Plesk zone, `webhosting.iframe.gr` has an A record pointing to `76.76.21.21` (Vercel), with no AAAA record.

1. **Database:** add Neon from the Vercel Marketplace. Vercel sets `DATABASE_URL`. The build runs `prisma generate`. Run `pnpm db:migrate` against Neon once.
2. **Environment variables:** copy every key from `.env.example` into Vercel. Set `APP_URL=https://webhosting.iframe.gr` and leave `EMAIL_REDIRECT_TO` empty.
3. **Viva:**
   - Create a Smart Checkout payment source. Set its Success URL to `https://webhosting.iframe.gr/pay/viva/success` and its Failure URL to `https://webhosting.iframe.gr/pay/viva/failure`.
   - Add the webhook `https://webhosting.iframe.gr/api/webhooks/viva` for the event *Transaction Payment Created*.
   - Start in demo mode (`VIVA_ENV=demo`).
4. **Elorus:**
   - Use a test organization first.
   - Set the document series ids in `ELORUS_DOCTYPE_TPY`, `ELORUS_DOCTYPE_APY`, `ELORUS_DOCTYPE_EU` and `ELORUS_DOCTYPE_NON_EU`.
   - Before the first real invoice, check the lines marked `VERIFY` in `src/lib/elorus/client.ts` against the Elorus API docs.
5. **Email:** emails come from `billing@webhosting.iframe.gr`, with replies going to `info@iframe.gr`. The sending domain is `webhosting.iframe.gr`, verified in Resend with records in the Plesk zone for webhosting.iframe.gr (Cloudflare delegates the subdomain to Plesk). No mailbox is needed for billing@: Resend sends without one, and replies go to info@iframe.gr. Then set `RESEND_API_KEY`.
6. **Inngest:** install the Inngest Vercel integration. It sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
7. **Cron:** set `CRON_SECRET`. Vercel Cron calls `/api/cron/reminders` and `/api/cron/sync`.
8. **Test:** make one real €1 renewal end to end.

## Tests

```bash
pnpm test        # Vitest against a local Postgres (TEST_DATABASE_URL), all providers mocked
```
