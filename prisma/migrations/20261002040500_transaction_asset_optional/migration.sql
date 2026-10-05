-- DropIndex
DROP INDEX "assets_symbol_idx";

-- AlterTable
ALTER TABLE "transactions" ALTER COLUMN "assetId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "assets_symbol_key" ON "assets"("symbol");
