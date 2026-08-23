// persistWorker/main.ts
import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import prisma from "../db/prisma.js";

const symbolToAssetId = new Map<string, string>();

async function loadAssetMap() {
  const assets = await prisma.asset.findMany();
  for (const a of assets) symbolToAssetId.set(a.symbol, a.id);
}

async function main() {
  await loadAssetMap();

  new Worker(
    "persist-orders",
    async (job) => {
      const { order, fills, balances } = job.data;

      // ---- order ----
      await prisma.order.upsert({
        where: { id: order.id },
        update: { filledQty: order.filledQty, status: order.status.toUpperCase() },
        create: {
          id: order.id,
          userId: order.userId,
          assetId: symbolToAssetId.get(order.stockId)!, // symbol -> uuid translation
          side: order.side.toUpperCase(),
          orderType: order.orderType.toUpperCase(),
          price: order.price,
          qty: order.qty,
          filledQty: order.filledQty,
          status: order.status.toUpperCase(),
        },
      });

      // ---- fills ----
      if (fills.length) {
        await prisma.fill.createMany({
          data: fills.map((f: any) => ({
            id: f.id,
            assetId: symbolToAssetId.get(f.stockId)!,
            buyOrderId: f.buyOrderId,
            sellOrderId: f.sellOrderId,
            price: f.price,
            qty: f.qty,
          })),
          skipDuplicates: true, // in case of a retried job re-processing the same fill ids
        });
      }

      // ---- balances ----
      for (const { userId, balance } of balances) {
        await prisma.balance.update({
          where: { userId },
          data: { total: String(balance.total), locked: String(balance.locked) },
        });

        for (const [symbol, stockBal] of Object.entries(balance.stocks) as [string, any][]) {
          const assetId = symbolToAssetId.get(symbol);
          if (!assetId) continue;

          await prisma.assetBalance.upsert({
            where: { userId_assetId: { userId, assetId } }, // matches the new @@unique
            update: { qty: String(stockBal.qty), locked: String(stockBal.locked) },
            create: {
              userId,
              assetId,
              qty: String(stockBal.qty),
              locked: String(stockBal.locked),
              balance: { connect: { userId } },
            },
          });
        }
      }
    },
    { connection: redis, concurrency: 5 },
  );

  console.log("Persist worker started");
}

main();