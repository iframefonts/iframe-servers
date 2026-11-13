-- CreateEnum
CREATE TYPE "PlanKind" AS ENUM ('hosting', 'domain');

-- AlterTable
ALTER TABLE "PaymentRequest" ADD COLUMN     "lines" JSONB;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "kind" "PlanKind" NOT NULL DEFAULT 'hosting';

-- CreateTable
CREATE TABLE "PackageDomain" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customPriceNetCents" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackageDomain_websiteId_key" ON "PackageDomain"("websiteId");

-- AddForeignKey
ALTER TABLE "PackageDomain" ADD CONSTRAINT "PackageDomain_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "HostingPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageDomain" ADD CONSTRAINT "PackageDomain_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageDomain" ADD CONSTRAINT "PackageDomain_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

