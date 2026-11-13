-- CreateEnum
CREATE TYPE "Language" AS ENUM ('el', 'en');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('TPY', 'APY');

-- CreateEnum
CREATE TYPE "VatRegime" AS ENUM ('domestic', 'eu_reverse_charge', 'non_eu');

-- CreateEnum
CREATE TYPE "PackageStatus" AS ENUM ('active', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "ReminderKind" AS ENUM ('d30', 'd7', 'd1', 'overdue3d');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('viva', 'bank_transfer');

-- CreateEnum
CREATE TYPE "PaymentRequestStatus" AS ENUM ('open', 'paid', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('recorded', 'needs_refund');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('pending', 'issued', 'failed');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('pending', 'sent', 'delivered', 'failed');

-- CreateTable
CREATE TABLE "LoginToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "elorusContactId" TEXT,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "vatNumber" TEXT,
    "taxOffice" TEXT,
    "address" TEXT,
    "emails" TEXT[],
    "phone" TEXT,
    "language" "Language" NOT NULL DEFAULT 'el',
    "invoiceType" "InvoiceType" NOT NULL DEFAULT 'TPY',
    "vatRegime" "VatRegime" NOT NULL DEFAULT 'domestic',
    "notes" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Website" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "server" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Website_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceNetCents" INTEGER NOT NULL,
    "periodMonths" INTEGER NOT NULL DEFAULT 12,
    "elorusProductId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HostingPackage" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customPriceNetCents" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "PackageStatus" NOT NULL DEFAULT 'active',
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageWebsite" (
    "packageId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,

    CONSTRAINT "PackageWebsite_pkey" PRIMARY KEY ("packageId","websiteId")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "kind" "ReminderKind" NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "emailId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRequest" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "vatRate" INTEGER NOT NULL,
    "status" "PaymentRequestStatus" NOT NULL DEFAULT 'open',
    "vivaOrderCode" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "paymentRequestId" TEXT,
    "packageId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'recorded',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "elorusInvoiceId" TEXT,
    "number" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'pending',
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginToken_tokenHash_key" ON "LoginToken"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Client_elorusContactId_key" ON "Client"("elorusContactId");

-- CreateIndex
CREATE UNIQUE INDEX "Website_domain_key" ON "Website"("domain");

-- CreateIndex
CREATE INDEX "HostingPackage_status_expiresAt_idx" ON "HostingPackage"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_packageId_kind_periodEnd_key" ON "Reminder"("packageId", "kind", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_token_key" ON "PaymentRequest"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_vivaOrderCode_key" ON "PaymentRequest"("vivaOrderCode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRequest_packageId_periodEnd_key" ON "PaymentRequest"("packageId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_paymentId_key" ON "Invoice"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "Website" ADD CONSTRAINT "Website_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingPackage" ADD CONSTRAINT "HostingPackage_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HostingPackage" ADD CONSTRAINT "HostingPackage_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageWebsite" ADD CONSTRAINT "PackageWebsite_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "HostingPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageWebsite" ADD CONSTRAINT "PackageWebsite_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "HostingPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRequest" ADD CONSTRAINT "PaymentRequest_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "HostingPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentRequestId_fkey" FOREIGN KEY ("paymentRequestId") REFERENCES "PaymentRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "HostingPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
