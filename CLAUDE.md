# iFRAME Servers

Internal app: hosting packages, renewal reminders (30/7/1 days), Viva payments (no Stripe), Elorus invoices.
Full plan: `iFRAME Servers — Build Plan for Claude Code.md`. Next.js rules: see `AGENTS.md` (Next 16 differs from older versions: `proxy.ts`, async params, route types).

Stack: Next.js 16 App Router, TypeScript, Prisma 7 (driver adapter `@prisma/adapter-pg`) + Postgres (Neon in production), Tailwind 4 + shadcn/ui (Base UI: use `render`, not `asChild`), Resend + React Email, Inngest, Vitest.

## Rules

- Money in integer cents. Dates stored UTC; "days left" computed in Europe/Athens (`src/lib/dates.ts`).
- Never call live Viva/Elorus/Resend in tests: tests force mock mode. Empty provider keys = mock mode in dev (a banner says so).
- Webhooks: verify (re-fetch the Viva transaction), store event, return 200 fast; Elorus work runs as a retryable job (`src/lib/jobs.ts` → Inngest, or inline without Inngest).
- Every external effect is idempotent: unique keys on reminders `(packageId, kind, periodEnd, seq)`, payments `transactionId`, webhook events, Resend idempotency keys.
- All payments go through `recordPayment()` (`src/lib/payments/record.ts`): a PaymentRequest moves open → paid exactly once; anything else is `needs_refund` and never extends the package.
- VAT comes from `Client.vatRegime` (domestic 24%, EU reverse charge 0%, non-EU 0%) via `amountsFor()`. Payment stores netCents/vatCents; never recompute VAT from gross.
- Prices: never sum plan prices by hand. `renewalLines()` (`src/lib/renewal.ts`) builds each renewal: hosting + every `PackageDomain` due on it (.gr = 24 months, renewed on the same date as hosting). The PaymentRequest stores the lines; invoices, pay page and emails read them.
- Client tax details come from Elorus only (read-only here). Local extras: language, invoice type, VAT regime, notes.
- UI and client emails in Greek and English (`src/lib/i18n.ts`). Admin UI is English.
- Team alerts go to ADMIN_EMAIL=info@iframe.gr. Plans are 12 or 24 months.

## UI rules (Apple HIG principles; review with the apple-design skill)

- Organized around renewals: Today (Needs attention first), Renewals, Calendar, Clients, Plans, Settings.
- Status vocabulary from `src/lib/status.ts`, rendered by `StatusBadge`: text + icon, never color alone. Red only means "needs action".
- Irreversible actions (issuing an invoice, emailing a client) confirm with the exact consequence (`ActionButton confirm`, `ReminderSheet`). Undoable ones don't.
- Feedback in place (toasts, inline form errors), not alerts. Every list has an empty state.
- Appearance follows the system (no theme toggle). Money: right-aligned, `.num` (tabular numbers). Hit targets ≥ 36px desktop, 44px on the pay page.
- Charts: series colors `--series-1/2` (dataviz-validated), a text summary and a "View as table" toggle on each.

## Commands

- `pnpm dev` · `pnpm test` · `pnpm typecheck` · `pnpm lint`
- `pnpm db:migrate` (deploy migrations) · `pnpm db:seed` (demo data, local only) · `pnpm import:sheet <file.html> [--dry-run]`
- New migration: edit `prisma/schema.prisma`, then `npx prisma migrate dev --name <name>` (interactive terminal) or `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new folder.

## Deploy

GitHub (github.com/iframefonts/iframe-servers) → Vercel team “iframe” (account info@iframe.gr, not Sinqlo), main = production, at **https://webhosting.iframe.gr**. iframe.gr DNS is on Cloudflare (not Plesk): all DNS records go there. Cron in `vercel.json` (07:00 UTC reminders, 01:00 UTC Elorus sync). Database: Neon via the Vercel Marketplace.
