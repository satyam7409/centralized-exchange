import { getPersistQueue } from "../config/redis.js";
import type { Order, Fill } from "../types.js";

export async function queuePersist(order: Order, newFills: Fill[]) {
  const queue = getPersistQueue();
  await queue.add("persist", { order, fills: newFills });
}