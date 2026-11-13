# iFRAME Servers — Build Plan for Claude Code

Nov 13, 2026 · @iFRAME DESIGN STUDIO

## Goal and scope

An internal admin app where iFRAME records each client's hosting packages (websites, plan, cost, expiry). It emails the client 30, 7 and 1 day before expiry with a pay link. When the client pays by card through Viva (decided 13 Nov 2026: Viva only, no Stripe), the app creates the invoice in Elorus and Elorus emails it to the client.

Version 1 includes:

- Clients, websites/domains, plans and hosting packages with price and expiry date
- Automatic reminder emails at 30, 7 and 1 day before expiry (Greek or English per client)
- A pay page per renewal with Viva Smart Checkout
- On payment: renew the package, issue the Elorus invoice, record the payment, email the invoice
- Logs of reminders, payments and invoices, plus a dashboard of what expires soon
- Manual actions: send reminder now, mark paid by bank transfer, re-send invoice

## Key decision: who takes the payment

Recommended: the app takes the payment, then issues the Elorus invoice. That matches the brief (invoice only after payment) and means no invoice reaches myDATA for a client who doesn't renew.

|  | A. App-first (recommended) | B. Elorus-first |
| --- | --- | --- |
| Flow | Reminder → app pay page (Viva) → webhook → app creates, issues and emails the Elorus invoice | App creates the Elorus invoice before expiry → Elorus emails it with its own pay-online link → Elorus marks it paid |
| Invoice issued | After payment | Before payment |
| Unpaid renewals | Nothing to cancel | Needs a credit note |
| Build effort | Higher: Viva checkout, webhooks | Lower: Elorus already supports [Viva](https://www.elorus.com/en/integrations/vivawallet-online-payments/) and auto-marks invoices paid |

If you go with A, do not also enable Elorus' own Viva gateway on these invoices. A client could otherwise pay twice.

## Tech stack

One Next.js app with Postgres. Claude Code knows this stack well, and it deploys to Vercel from GitHub.

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router) + TypeScript | Admin UI, public pay page and webhook routes in one codebase |
| UI | Tailwind + shadcn/ui | Fast, clean admin tables and forms |
| Database | Neon Postgres (connected through Vercel) + Prisma | Relations, unique constraints for idempotency |
| Auth | Auth.js with email magic link, allow-list of iFRAME addresses | Only the team logs in |
| Email | Resend (or SMTP) + React Email templates, GR/EN | Reminder emails from e.g. billing@iframe.gr |
| Scheduler | Daily cron at 09:00 Europe/Athens calling `/api/cron/reminders` | Vercel Cron in vercel.json at 07:00 UTC (09:00 Athens in winter, 10:00 in summer) |
| Jobs | Inngest (decided) | Elorus calls and reminder retries run outside the request, within minutes. A plain jobs table would need a frequent cron worker, and Vercel Hobby cron runs at most daily. The webhook triggers the invoice job immediately |
| Payments | Viva Smart Checkout via REST (OAuth2 client credentials) | Official API. Viva only; no Stripe |
| Validation / tests | Zod, Vitest, Playwright | Tests run against mocks, never live keys |

Prefer PHP? Laravel with the [laravel-viva-payments](https://github.com/sebdesign/laravel-viva-payments) package covers Smart Checkout and webhooks; the rest of the plan stays the same.

## Data model

Store money in cents, dates in UTC, and calculate "days left" in Europe/Athens.

| Table | Key fields | Notes |
| --- | --- | --- |
| `Client` | name, company, VAT no (ΑΦΜ), tax office, address, emails\[\], phone, language (el/en), invoice type (ΤΠΥ / ΑΠΥ), **vatRegime (domestic / eu_reverse_charge / non_eu)**, `elorusContactId` | Always linked to an Elorus contact; details synced from Elorus (next section). vatRegime decides the VAT rate and Elorus document type: 24% domestic, 0% reverse charge for EU businesses with a VIES-valid VAT number, outside scope for non-EU |
| `Website` | domain, clientId, server/host, notes | One client, many sites |
| `Plan` | name, kind (hosting / domain), priceNetCents, periodMonths (12, or 24 for .gr domains), `elorusProductId` | VAT comes from the client's regime, not the plan |
| `HostingPackage` | clientId, planId, customPriceCents?, startDate, `expiresAt`, status (active / expired / cancelled), remindersEnabled | The thing that renews. A payment after expiry sets status back to active |
| `PackageWebsite` | packageId, websiteId | Join table (Prisma can't enforce foreign keys inside arrays) |
| `PackageDomain` | packageId, websiteId, planId (a domain plan), customPriceNetCents?, expiresAt | A domain renewed **on the same date** as the package's hosting. It rides along on the hosting renewal it's due on: a .gr domain (24 months) every 2nd year, other endings yearly. Payment moves each item by its own period |
| `Reminder` | packageId, kind (30d / 7d / 1d / overdue3d), periodEnd, **status (pending / sent / failed)**, attempts, sentAt, emailId | Unique on (packageId, kind, periodEnd). Failed sends retry through Inngest within minutes; Resend gets idempotency key `reminder:{id}` |
| `PaymentRequest` | packageId, periodEnd, lines (hosting + domains due), netCents, vatCents, amountCents, token (32 random bytes), expiresAt, provider, vivaOrderCode, status (open / paid / cancelled / expired) | Backs the pay page. Amount is snapshotted at creation and recalculated if the price changes while still open. Moves open → paid exactly once (conditional update) |
| `Payment` | paymentRequestId, provider, transactionId (unique), netCents, vatCents, amountCents, paidAt, status (recorded / needs_refund), rawPayload (90-day retention) | Only the first payment on a request counts and extends the package; a second one (other tab, other provider) is flagged needs_refund |
| `Invoice` | paymentId, elorusInvoiceId, number, status, emailedAt, emailStatus | Elorus result per payment |
| `WebhookEvent` / `Job` | provider, eventId (unique), processedAt; job type, attempts, lastError | Idempotency and retries |

## Clients from Elorus

Elorus is the single source of truth for client details. Nobody retypes a name, ΑΦΜ or address in this app, so invoices always match your books.

| Action | How it works | Elorus API |
| --- | --- | --- |
| Add a client | Search Elorus contacts by name, ΑΦΜ or email, pick one; the app stores `elorusContactId` plus a cached copy | `GET /v1.1/contacts/?search=…` |
| Client not in Elorus yet | Short form creates the contact in Elorus first, then links it | `POST /v1.1/contacts/` |
| Change details | Edited in Elorus. The app shows them read-only with "Open in Elorus" and "Refresh" buttons | — |
| Nightly sync (03:00) | Refreshes every linked contact; logs what changed (e.g. new address or email) | `GET /v1.1/contacts/{id}/` |
| Before each invoice | Refreshes that one contact again | `GET /v1.1/contacts/{id}/` |
| Client balance | Client page shows unpaid and paid Elorus invoices for that contact | `GET /v1.1/invoices/` filtered by client |

Cached fields: company or full name, ΑΦΜ, tax office, address, emails, phone, client type. The app keeps only its own extras locally: language, ΤΠΥ/ΑΠΥ choice, notes.

A client gets a warning badge, and reminders still go out but invoicing pauses, when Elorus is missing what the invoice needs: ΑΦΜ, tax office and address for ΤΠΥ; name and email for ΑΠΥ. Filter parameters and field names are confirmed against the Elorus docs in Phase 1.

## Reminder engine

One daily run at 09:00 Athens time sends every reminder that is due and not yet sent. Windows, not exact days, mean a missed run never skips a reminder.

| Reminder | Sent when days left is | Email says |
| --- | --- | --- |
| Month | 30 down to 8 | Your hosting for {domain} renews on {date}: {amount} incl. VAT. Pay now. |
| Week | 7 down to 2 | Same, more direct |
| Day before | 1 or 0 | Expires tomorrow, please renew today. A copy goes to info@iframe.gr |
| Admin digest | Every run | List of packages expiring in 30 days and overdue ones, to the iFRAME team |
| Overdue alert (team only) | 3 days after expiry, still unpaid | To info@iframe.gr: client, domain, amount, days overdue. The client gets nothing and the site stays online |

Rules for the run:

1. Select active packages with `remindersEnabled` and `expiresAt` within 30 days.
2. Skip any package whose current period is already paid.
3. Pick the most urgent reminder not yet sent for this period. Insert the `Reminder` row as `pending`; the unique constraint blocks duplicates.
4. Create or reuse the `PaymentRequest` and email a link to `/pay/{token}`.
5. Send with Resend idempotency key `reminder:{id}`, then mark `sent` with the email id. A failed send marks it `failed` and an Inngest retry resends within minutes (up to 5 attempts, then the admin is alerted). Pending rows older than 15 minutes are retried too, so a crash never loses a reminder.
6. After expiry, mark the package `expired` and stop client reminders. Three days after expiry, if still unpaid, email info@iframe.gr once (kind overdue3d). Sites are never suspended automatically.

Payment moves `expiresAt` forward, so the next period's reminders start fresh automatically.

## Payment → Elorus invoice flow

The webhook only records the payment and returns 200. A background job does the Elorus work and retries until it succeeds.

1. **Pay page.** `/pay/{token}` shows the domain, plan, period, total and the details the invoice will be issued to. It checks the request status before redirecting anywhere (see Pay page under Screens).
2. **Checkout.**
   - Viva: create a payment order with the Smart Checkout API, put the `PaymentRequest` id in `merchantTrns`, and redirect to Smart Checkout. The [integration flow](https://developer.viva.com/smart-checkout/smart-checkout-integration/) is: create order, redirect, confirm, verify.
3. **Webhook in.**
   - Viva: subscribe to *Transaction Payment Created* (EventTypeId 1796). The endpoint must also answer Viva's GET with the key from the [Retrieve webhook key](https://developer.viva.com/webhooks-for-payments/setting-up-webhooks/) call. Before trusting it, fetch the transaction and check `orderCode`, `statusId` and `amount` match, as [Viva recommends](https://developer.viva.com/webhooks-for-payments/). Viva retries any non-2xx about hourly, up to 23 times.
4. **Record.** In one transaction: save `WebhookEvent` and `Payment` (unique transaction id, so repeats do nothing), then `UPDATE PaymentRequest SET status='paid' WHERE id=… AND status='open'`. Only if that update hits a row: extend `expiresAt` by the plan period from the old expiry date (not from today), set the package `active`, and trigger the `issue-invoice` job. If it hits no row, the request was already paid: mark this payment `needs_refund` and alert the admin. When the payment succeeds, cancel any other open Viva order for the same request.
5. **Elorus job.** All calls send `Authorization: Token <key>` and `X-Elorus-Organization: <org id>` ([example](https://developer.elorus.com/el/examples/service-rendered-receipt)).
   - Refresh the client from Elorus (`GET /v1.1/contacts/{id}/`) so the invoice uses current tax details. If required details are missing, stop and alert the admin.
   - Create the invoice as issued, not draft (`POST /v1.1/invoices/`): document type from invoice type + VAT regime (ΤΠΥ, ΑΠΥ, or the intra-EU / non-EU series), plan line item, VAT from the client's regime (24% / 0% reverse charge / outside scope), period in the description.
   - Record the payment against it (cash receipt endpoint), so it shows as paid.
   - Email it with the invoice email endpoint, PDF attached. Track delivery with the new [`/sent-email-messages`](https://www.elorus.com/product-updates/api-primary-attachments-email-status/) endpoint.
6. **Confirm.** Show the thank-you page, then email the admin: paid, invoice number, new expiry. After 5 failed attempts the job alerts the admin instead.

Exact Elorus paths for cash receipts and invoice email must be checked in the [Elorus API docs](https://developer.elorus.com/) in Phase 5. The docs site could not be opened while this plan was written.

## Screens

The app is organized around the renewal, not around database tables. Five admin sections plus the public pay pages. UI/UX follows Apple's HIG principles and foundations (accessibility, color, typography, layout, writing); see the UI rules below.

| Screen | What it does |
| --- | --- |
| Today | "Needs attention" list first, then four cards and a Reports tab (see Dashboard below) |
| Renewals | Every hosting package with status, expiry, amount. Filters: expiring 7/30 days, overdue, reminders paused, website. The package page shows the **renewal timeline** (30d reminder sent → 7d sent → paid via Viva → invoice ΤΠΥ-0142 issued → emailed, delivered) with its actions beside it: Send Reminder, Mark Paid by Bank Transfer, Resend Invoice, Pause Reminders. Create: client + sites + plan + start date → expiry calculated. Reminder and payment logs are filtered views here |
| Clients | Add by searching Elorus contacts (name, ΑΦΜ, email); detail shows synced tax details read-only, websites, packages, invoices. Websites are managed here (no separate screen) |
| Plans | Hosting tiers with price and period |
| Settings | Sender address, read-only previews of the GR/EN email templates (templates and the 30/7/1 windows live in code), API health checks, team allow-list |
| Public: `/pay/{token}`, `/pay/success`, `/pay/cancel` | Client-facing, iFRAME branded, no login, `noindex` |

### Status vocabulary

One set of names everywhere, each shown as text plus an icon, never color alone. One color per category.

| Status | Category |
| --- | --- |
| Active, Upcoming | Neutral |
| Reminded (30d / 7d / 1d), Invoicing… | In progress (blue) |
| Paid, Invoiced, Emailed | Done (green) |
| Overdue, Missing tax details, Invoice failed, Needs refund | Needs action (red, used for nothing else) |
| Cancelled, Reminders paused | Muted (gray) |

### Pay page

Designed for phones first: clients arrive from an email.

- One primary button with the amount: "Pay €148.80 by card" (Viva Smart Checkout).
- Shows the details the invoice will be issued to (name, ΑΦΜ, address) with "Details wrong? Reply to this email."
- Every state is designed: open, already paid, link expired, amount changed, cancelled, provider error.
- GR/EN switch, defaulting to the client's language.
- Branding is restrained and defers to the content. Apple Pay / Google Pay appear only inside Viva's hosted checkout; never draw an Apple Pay button or mark on our page.

### UI rules

- **Irreversible actions get a confirmation dialog that names the consequence.** "Mark Paid by Bank Transfer" shows "Issue ΤΠΥ invoice for €148.80 to ACME ΙΚΕ (ΑΦΜ …)" with Cancel and an "Issue Invoice" button. "Send Reminder" shows the email preview in a sheet first. Undoable actions (pause reminders) get no dialog.
- **Async work is visible.** Elorus search is debounced with skeleton rows; after payment the row shows "Invoicing…" until the job finishes.
- **Words:** "Package" in admin, "Renewal" in client-facing copy. Buttons are verbs ("Send Reminder", "Issue Invoice", "Resend Invoice"). ΤΠΥ/ΑΠΥ never appear in client emails. Every list has an empty state that says what happens next.
- **Accessibility:** WCAG AA contrast (4.5:1 body text), visible keyboard focus, every icon button has a label, charts have a text summary and a "View as table" toggle, net/VAT bars are labelled, not color-coded only.
- **Appearance follows the system** (light/dark). No in-app theme toggle.
- **Tables:** money right-aligned with tabular numbers; layouts leave ~30% room for Greek labels.

## Dashboard

The Today screen answers "what needs me today?" first, then "how big is hosting and what money is coming in". Every income figure shows net, VAT and gross, in EUR.

**Needs attention** (top, each row with its action button; empty state "Nothing needs you today."):

- Invoice jobs failed after 5 attempts
- Payments without an invoice yet, and payments flagged Needs refund
- Clients missing tax details
- Packages overdue more than 3 days
- Packages expiring within 7 days and unpaid
- Failing API health checks

**Four cards:** Overdue (amount, count), Due in 30 days, Income this year, Annual recurring revenue.

**Reports tab** (the full set):

| Card | Metric | Calculated from |
| --- | --- | --- |
| Clients | Active clients (at least one active package) / all linked clients | `Client`, `HostingPackage` |
| Websites | Total websites / websites on an active package | `Website` |
| Packages | Active, expiring in 30 days, expired and unpaid | `HostingPackage.expiresAt`, `status` |
| Income | This month, this year, last year, all time | `Payment` (Viva and bank transfers marked paid) |
| Recurring revenue | Yearly value of all active packages | Sum of price ÷ period months × 12 |
| Expected renewals | Amount due in the next 30 and 90 days | Packages expiring in that window |
| Overdue | Amount and count of expired, unpaid packages | Expired packages with no payment for the period |
| Averages | Income per client and per website, this year | Income ÷ active clients / websites |

Charts in the Reports tab, each with a one-line text summary (e.g. "Income up 12% on last year") and a "View as table" toggle:

- Income per month, last 12 months (bars, net and VAT stacked and labelled)
- Income by plan, this year
- Renewals calendar: amount due per month for the next 12 months
- Top 10 clients by income, this year, as a sortable table, not a chart

A year filter changes all cards and charts. A small reconciliation badge compares this year's app income with paid Elorus hosting invoices and flags any difference.

## Build phases for Claude Code

Seven phases, one Claude Code session each. Start each in plan mode, review the plan, then let it build and run the tests. Commit after every phase.

**Phase 0 — CLAUDE.md.** Put this in the repo root first:

```markdown
# iFRAME Servers
Internal app: hosting packages, renewal reminders (30/7/1 days), Viva payments (no Stripe), Elorus invoices.
Stack: Next.js App Router, TypeScript, Prisma/Postgres, Tailwind + shadcn/ui, Resend, Vitest.
Rules:
- Money in integer cents. Dates stored UTC; "days left" computed in Europe/Athens.
- Never call live Viva/Elorus in tests: use mocks. Dev uses Viva demo and an Elorus test organization; with empty keys the app runs in mock mode.
- Webhooks: verify, store event, return 200 fast; side effects run as retryable jobs.
- Every external effect is idempotent (unique keys on reminders, payments, invoices).
- UI and emails in Greek and English.
- Team alerts go to ADMIN_EMAIL=info@iframe.gr. Plans are 12 or 24 months.
- Background work runs on Inngest (invoice jobs, reminder retries).
- A PaymentRequest moves open → paid exactly once; a second payment is flagged needs_refund and never extends the package.
- VAT comes from Client.vatRegime (domestic 24%, EU reverse charge 0%, non-EU outside scope).
- Payment stores netCents and vatCents; dashboards never recompute VAT from gross.
- UI: organized around renewals (Today, Renewals, Clients, Plans, Settings). Status vocabulary from the plan, text + icon, never color alone. Irreversible actions confirm with the exact consequence. Appearance follows the system; no theme toggle.
- Deploy: GitHub → Vercel (main = production); cron in vercel.json.
```

**Phase 1 — Foundation.**

```text
Scaffold the app per CLAUDE.md. Add Prisma models Client (with vatRegime), Website, Plan, HostingPackage, PackageWebsite, Reminder (with status), PaymentRequest (open/paid once, net/vat snapshot), Payment (net/vat, needs_refund), Invoice, WebhookEvent (see plan). Set up Inngest. Add Auth.js magic-link login limited to an ALLOWED_EMAILS list. Read the Elorus API docs for contacts. Build an ElorusClient (Token + X-Elorus-Organization headers, retries on 429/5xx). Clients are never typed in: build a Clients screen that searches Elorus contacts and links them, creates a contact in Elorus when missing, shows synced details read-only with Refresh, and a nightly sync job; flag clients missing invoice details. Build the app shell (sidebar: Today, Renewals, Clients, Plans, Settings), Plans CRUD, websites inside the client page, and Renewals with create/edit, expiry calculated from start date + plan period, and the renewal timeline on the package page. Use the status vocabulary and UI rules from the plan. Seed with sample data. Add a CSV import that matches existing clients to Elorus contacts by ΑΦΜ or email.
```

**Phase 2 — Reminders.**

```text
Build the reminder engine: a function runReminders(now) and a protected route /api/cron/reminders (CRON_SECRET). Use windows 30–8, 7–2, 1–0 days in Europe/Athens; insert Reminder as pending before sending; unique (packageId, kind, periodEnd); Resend idempotency key reminder:{id}; failed or stale pending rows retry via Inngest, admin alert after 5 attempts. Create React Email templates GR/EN with a link to /pay/{token}. Copy the 1-day reminder to ADMIN_EMAIL. Send a team-only overdue alert 3 days after expiry (no client email, no suspension). Add an admin digest email and a reminders log screen with "send now". Write Vitest tests with a fake clock covering missed days, duplicates and paid periods.
```

**Phase 3 — Pay page + payment recording.**

```text
Build /pay/[token], /pay/success, /pay/cancel and a mock checkout for local testing. Build recordPayment: store WebhookEvent and Payment idempotently, move the PaymentRequest open → paid with a conditional update; only then extend expiresAt from the old expiry, set the package active and trigger issue-invoice; otherwise flag needs_refund. Build every pay page state (open, paid, expired, amount changed, cancelled, error), GR/EN. Unit-test the double-payment race (two tabs).
```

**Phase 4 — Viva.**

```text
Add Viva Smart Checkout in the demo environment: OAuth2 client-credentials token, create payment order (amount in cents, merchantTrns = paymentRequestId), redirect. Add /api/webhooks/viva: GET returns the key from Viva's Retrieve webhook key API; POST handles EventTypeId 1796, re-fetches the transaction and checks orderCode, statusId and amount before recording. Reuse recordPayment from Phase 3.
```

**Phase 5 — Elorus.**

```text
Reuse the ElorusClient from Phase 1. Confirm endpoints for invoices, document types, taxes, cash receipts, invoice email and sent-email-messages. Implement the issue-invoice job: refresh the contact from Elorus, create issued invoice (ΤΠΥ or ΑΠΥ per client, 24% VAT), record payment, email invoice with PDF, save number and email status. Use an Elorus test organization. Add "Mark paid by bank transfer" that runs the same job.
```

**Phase 6 — Hardening.** Today screen: the Needs attention list first, then the four cards; Reports tab with charts (text summary + table toggle) as in the Dashboard section, with SQL aggregates and a year filter; job retries with backoff and admin alerts after 5 failures; Settings screen with API health checks; audit log; Playwright test of the full happy path with mocks.

**Phase 7 — Deploy.** Connect the GitHub repo to Vercel, add Neon and the production env vars, set the cron in vercel.json, register the live webhook URLs (your Vercel domain) in Viva, one real €1 test renewal end to end, then import real clients.

## Setup checklist

Get these ready before Phase 3; Claude Code cannot create them for you.

- [ ] Elorus API token (User profile → API token) and Organization ID (Settings → Organization)
- [ ] A separate Elorus test organization for development
- [ ] Elorus document types/series for hosting invoices (ΤΠΥ and ΑΠΥ) and a "Web hosting" product
- [ ] Elorus myDATA / e-invoicing provider connected, so issued invoices are transmitted
- [ ] Viva demo account: Smart Checkout client ID and secret, payment source code, Merchant ID and API key (for the webhook key)
- [ ] Viva webhook created under Settings → API Access → Webhooks once the URL is live
- [ ] Sending domain for reminders (e.g. billing@iframe.gr) with SPF and DKIM in Resend
- [ ] GitHub repo created and connected to Vercel (preview per branch, main = production); Neon database added in Vercel
- [ ] Export of current clients, domains, plans and expiry dates (CSV)

## Risks and open questions

The biggest risk is tax, not code: confirm the invoice timing and document types with your accountant before Phase 5.

- **Accountant check:** invoice after payment, ΤΠΥ for businesses and ΑΠΥ for individuals, and how the payment-provider date maps to the invoice date.
- **Double payment:** keep Elorus' own Viva pay links off these invoices.
- **Webhooks in development** need public HTTPS: use a tunnel (cloudflared or ngrok) for the Viva webhook.
- **Elorus limits:** rate limits are not documented in what was checked, so the client retries with backoff.
- **Accountant check (VAT regime):** foreign clients. EU businesses with a VIES-valid VAT number get reverse charge at 0% on an intra-EU document series; non-EU clients are outside scope. Confirm the Elorus document series for each.
- **Edge cases:** price changes mid-period (open pay links are recalculated), several sites on one package, a client paying after expiry (package returns to active), double payments (flagged needs_refund; refund and credit note done by hand), refunds (credit note done by hand in Elorus).

Decided on 13 Nov 2026:

- **Billing period:** yearly hosting; some .gr domains renew every 2 years.
- **1-day reminder:** also copied to the iFRAME team at info@iframe.gr.
- **After expiry:** no automatic suspension. If still unpaid 3 days after expiry, alert info@iframe.gr only.
- **Hosting:** Vercel, deployed from a GitHub repo (github.com/iframefonts/iframe-servers).
- **Payments:** Viva only. No Stripe.
- **Domains:** a client's plan can include hosting and domain names. Domains renew on the same date as the hosting; .gr every 2 years, others yearly. When a domain is due, the renewal email, pay page and one Elorus invoice include it as a second line.
- **Calendar:** a Calendar screen shows renewals per month (next 12 months or a year).
- **Database:** PostgreSQL — Neon via the Vercel Marketplace in production.

### Sources

- [Elorus — Viva online payments integration](https://www.elorus.com/en/integrations/vivawallet-online-payments/)
- [Elorus API example: service receipt (auth headers, endpoints)](https://developer.elorus.com/el/examples/service-rendered-receipt)
- [Elorus API update: sent-email-messages (June 2026)](https://www.elorus.com/product-updates/api-primary-attachments-email-status/)
- [Viva — Webhooks for payments](https://developer.viva.com/webhooks-for-payments/)
- [Viva — Setting up webhooks](https://developer.viva.com/webhooks-for-payments/setting-up-webhooks/)
- [Viva — Smart Checkout integration](https://developer.viva.com/smart-checkout/smart-checkout-integration/)
