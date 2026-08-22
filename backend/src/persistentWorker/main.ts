import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import prisma from "../db/prisma.js";

new Worker(
  "persist-orders",
  async (job) => {
    const { order, fills } = job.data;

    await prisma.order.upsert({
      where: { id: order.id },
      update: {
        filledQty: order.filledQty,
        status: order.status.toUpperCase(),
      },
      create: {
        id: order.id,
        userId: order.userId,
        assetId: order.stockId,
        side: order.side.toUpperCase(),
        orderType: order.orderType.toUpperCase(),
        price: order.price,
        qty: order.qty,
        filledQty: order.filledQty,
        status: order.status.toUpperCase(),
      },
    });

    if (fills.length) {
      await prisma.fill.createMany({
        data: fills.map((f: any) => ({
          id: f.id,
          assetId: f.stockId,
          buyOrderId: f.buyOrderId,
          sellOrderId: f.sellOrderId,
          price: f.price,
          qty: f.qty,
        })),
      });
    }
  },
  { connection: redis, concurrency: 5 }, // safe to parallelize — writes are independent by id
);

console.log("Persist worker started");
