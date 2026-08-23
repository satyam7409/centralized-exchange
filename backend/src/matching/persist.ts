import { getPersistQueue } from "../config/redis.js";
import type { Order, Fill , User} from "../types.js";

interface AffectedBalance {
  userId: string;
  balance: User["balance"];
}

export async function queuePersist(order: Order, newFills: Fill[], affectedBalances: AffectedBalance[]) {
  const queue = getPersistQueue();
  await queue.add("persist", { order, fills: newFills, balances: affectedBalances });
}