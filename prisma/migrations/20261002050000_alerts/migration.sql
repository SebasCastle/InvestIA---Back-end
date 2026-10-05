-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('PRICE_ABOVE', 'PRICE_BELOW', 'RETURN_ABOVE', 'RETURN_BELOW');

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "portfolioId" UUID,
    "symbol" TEXT,
    "kind" "AlertKind" NOT NULL,
    "threshold" DECIMAL(18,8) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerts_userId_idx" ON "alerts"("userId");

-- CreateIndex
CREATE INDEX "alerts_enabled_idx" ON "alerts"("enabled");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
