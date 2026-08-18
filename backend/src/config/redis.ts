import { Redis } from "ioredis";
import { Queue } from "bullmq";


export const redis = new Redis({ host: "localhost", port: 6379 });

export const orderQueue = new Queue("order", {
  connection: redis,
});
