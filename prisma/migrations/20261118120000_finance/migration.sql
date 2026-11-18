-- CreateEnum
CREATE TYPE "FinanceKind" AS ENUM ('invoice', 'credit_note', 'bill', 'expense');

-- CreateTable
CREATE TABLE "FinanceDoc" (
    "id" TEXT NOT NULL,
    "kind" "FinanceKind" NOT NULL,
    "elorusId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL,
    "typeLabel" TEXT NOT NULL,
    "contactId" TEXT,
    "contactName" TEXT NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "modified" TEXT NOT NULL,
    "linesModified" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinanceLine" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "netCents" INTEGER NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "FinanceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinanceDoc_year_month_idx" ON "FinanceDoc"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceDoc_kind_elorusId_key" ON "FinanceDoc"("kind", "elorusId");

-- CreateIndex
CREATE INDEX "FinanceLine_docId_idx" ON "FinanceLine"("docId");

-- CreateIndex
CREATE INDEX "FinanceLine_category_idx" ON "FinanceLine"("category");

-- AddForeignKey
ALTER TABLE "FinanceLine" ADD CONSTRAINT "FinanceLine_docId_fkey" FOREIGN KEY ("docId") REFERENCES "FinanceDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Default income categories (editable in Settings → Finance categories). First match wins.
INSERT INTO "CategoryRule" ("id", "pattern", "category", "position") VALUES
  ('default-rule-01', 'domain', 'Domains', 10),
  ('default-rule-02', 'server', 'Hosting', 20),
  ('default-rule-03', 'φιλοξενι', 'Hosting', 30),
  ('default-rule-04', 'hosting', 'Hosting', 40),
  ('default-rule-05', 'υποστηριξ', 'Support', 50),
  ('default-rule-06', 'support', 'Support', 60),
  ('default-rule-07', 'πλανο', 'Retainer plans', 70),
  ('default-rule-08', 'font', 'Fonts', 80),
  ('default-rule-09', 'γραμματοσειρ', 'Fonts', 90),
  ('default-rule-10', 'συσκευασ', 'Packaging', 100),
  ('default-rule-11', 'packaging', 'Packaging', 110),
  ('default-rule-12', 'ετικετ', 'Packaging', 120),
  ('default-rule-13', 'ταυτοτητ', 'Branding', 130),
  ('default-rule-14', 'λογοτυπ', 'Branding', 140),
  ('default-rule-15', 'brand', 'Branding', 150),
  ('default-rule-16', 'ιστοσελ', 'Websites', 160),
  ('default-rule-17', 'website', 'Websites', 170),
  ('default-rule-18', 'e-shop', 'Websites', 180),
  ('default-rule-19', 'eshop', 'Websites', 190),
  ('default-rule-20', 'web', 'Websites', 200),
  ('default-rule-21', 'διαφημισ', 'Advertising', 210),
  ('default-rule-22', 'σποτ', 'Advertising', 220),
  ('default-rule-23', 'social media', 'Advertising', 230),
  ('default-rule-24', 'καρτ', 'Print', 240),
  ('default-rule-25', 'εντυπ', 'Print', 250),
  ('default-rule-26', 'φυλλαδ', 'Print', 260),
  ('default-rule-27', 'σουπλα', 'Print', 270),
  ('default-rule-28', 'εκτυπωσ', 'Print', 280),
  ('default-rule-29', 'αφισ', 'Print', 290),
  ('default-rule-30', '3d', '3D & visuals', 300),
  ('default-rule-31', 'mockup', '3D & visuals', 310),
  ('default-rule-32', 'γραφιστ', 'Graphic design', 320),
  ('default-rule-33', 'σχεδια', 'Graphic design', 330),
  ('default-rule-34', 'design', 'Graphic design', 340),
  ('default-rule-35', 'concept', 'Graphic design', 350),
  ('default-rule-36', 'typeface', 'Fonts', 85),
  ('default-rule-37', 'typerface', 'Fonts', 86),
  ('default-rule-38', 'κουτι', 'Packaging', 115),
  ('default-rule-39', 'προβολ', 'Advertising', 225),
  ('default-rule-40', 'καταλογ', 'Print', 285),
  ('default-rule-41', 'μενου', 'Print', 286),
  ('default-rule-42', 'menu', 'Print', 287),
  ('default-rule-43', 'φακελ', 'Print', 288),
  ('default-rule-44', 'μπλοκ', 'Print', 289),
  ('default-rule-45', 'folder', 'Print', 290),
  ('default-rule-46', 'σημειωματαρ', 'Print', 291),
  ('default-rule-47', 'sticker', 'Print', 292),
  ('default-rule-48', 'roll up', 'Print', 293);
