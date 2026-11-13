-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'refunded';

-- AlterEnum
ALTER TYPE "ReminderKind" ADD VALUE 'manual';

-- DropIndex
DROP INDEX "Reminder_packageId_kind_periodEnd_key";

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "sentBy" TEXT,
ADD COLUMN     "seq" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Reminder_packageId_kind_periodEnd_seq_key" ON "Reminder"("packageId", "kind", "periodEnd", "seq");

