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

The app runs at **https://webhosting.iframe.gr**. iframe.gr's DNS is on **Cloudflare** (not Plesk). The app's records are in the Cloudflare zone for iframe.gr, all set to **DNS only** (grey cloud): `CNAME webhosting → d489941e332e9be1.vercel-dns-017.com` (Vercel), plus Resend's `resend._domainkey.webhosting` TXT, `send.webhosting` CNAME and `rsend.webhosting` CNAME.

0. **Domain:** done. `webhosting.iframe.gr` is on the Vercel project `iframe-servers` and serves HTTPS.

1. **Database:** add Neon from the Vercel Marketplace. Vercel sets `DATABASE_URL`. The build runs `prisma generate`. Run `pnpm db:migrate` against Neon once.
2. **Environment variables:** copy every key from `.env.example` into Vercel. Set `APP_URL=https://webhosting.iframe.gr` and leave `EMAIL_REDIRECT_TO` empty.
3. **Viva:**
   - Create a Smart Checkout payment source. Set its Success URL to `https://webhosting.iframe.gr/pay/viva/success` and its Failure URL to `https://webhosting.iframe.gr/pay/viva/failure`.
   - Add the webhook `https://webhosting.iframe.gr/api/webhooks/viva` for the event *Transaction Payment Created*.
   - Start in demo mode (`VIVA_ENV=demo`).
4. **Elorus** (API v1.2; confirmed on the demo organization). Set these on Vercel when switching production to the **real** organization:

   | Variable | Real organization value | What it is |
   |---|---|---|
   | `ELORUS_TOKEN` | (from Elorus › User Profile › API key) | API token |
   | `ELORUS_ORG_ID` | `1938566927869805663` | real organization |
   | `ELORUS_DOCTYPE_TPY` | `1938566928062744516` | ΤΙΜΟΛΟΓΙΟ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ |
   | `ELORUS_DOCTYPE_APY` | `1938566928062744517` | Απόδειξη παροχής υπηρεσιών |
   | `ELORUS_TAX_VAT24` | `1938566928004023931` | ΦΠΑ 24% |
   | `ELORUS_TAX_VAT0` | `2023461223718192915` | ΦΠΑ 0% |
   | `ELORUS_PRODUCT_DOMAIN` | `2258072299779393335` | Ανανέωση Domain Name ιστοσελίδας |
   | `ELORUS_VAT_EXEMPTION_EU` / `_NON_EU` | from the accountant | myDATA exemption category for 0% invoices |

   Also set each hosting plan's *Elorus product ID* (Plans page) to `1938581537578551237` (Ανανέωση Server ιστοσελίδας).
   The demo organization (`2517377211296646929`) is safe for tests: ΤΠΥ `3661581217997784718`, ΑΠΥ `3661581217997784717`, VAT24 `3661581221017683345`, VAT0 `3661581221017683344`.
   Once switched, any payment issues a real invoice sent to myDATA: start with a €1 test renewal.
5. **Email:** emails come from `billing@webhosting.iframe.gr`, with replies going to `info@iframe.gr`. The sending domain is `webhosting.iframe.gr`, verified in Resend with records in Cloudflare. No mailbox is needed for billing@: Resend sends without one, and replies go to info@iframe.gr. Then set `RESEND_API_KEY`.
6. **Inngest:** install the Inngest Vercel integration. It sets `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
7. **Cron:** set `CRON_SECRET`. Vercel Cron calls `/api/cron/reminders` and `/api/cron/sync`.
8. **Test:** make one real €1 renewal end to end.

## Tests

```bash
pnpm test        # Vitest against a local Postgres (TEST_DATABASE_URL), all providers mocked
```
