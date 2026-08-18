-- CreateEnum
CREATE TYPE "Side" AS ENUM ('BUY', 'SELL');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Balance" (
    "id" TEXT NOT NULL,
    "total" TEXT NOT NULL,
    "locked" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Balance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetBalance" (
    "id" TEXT NOT NULL,
    "qty" TEXT NOT NULL,
    "locked" TEXT NOT NULL,
    "balanceId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,

    CONSTRAINT "AssetBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "side" "Side" NOT NULL,
    "orderType" "OrderType" NOT NULL,
    "price" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "filledQty" INTEGER NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "buyOrderId" TEXT NOT NULL,
    "sellOrderId" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Balance_userId_key" ON "Balance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetBalance_balanceId_assetId_key" ON "AssetBalance"("balanceId", "assetId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_symbol_key" ON "Asset"("symbol");

-- AddForeignKey
ALTER TABLE "Balance" ADD CONSTRAINT "Balance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetBalance" ADD CONSTRAINT "AssetBalance_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "Balance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetBalance" ADD CONSTRAINT "AssetBalance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
