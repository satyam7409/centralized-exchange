import { Worker } from "bullmq";
import { redis } from "../config/redis.js";
import { matchOrder } from "../matching/match.js";
import { loadState } from "./loadState.js";
import {
  estimateMarketCost,
  findPriceIndex,
  insertLevelSorted,
} from "./helper.js";
import type {
  User,
  OrderBook,
  Order,
  OrderJobData,
  OrderJobResult,
} from "../types.js";

function resolveLeftover(
  newOrder: Order,
  remainingQty: number,
  spent: number,
  lockAmount: number,
  book: OrderBook[string],
  user: User,
  symbol: string,
) {
  if (remainingQty === 0) {
    newOrder.status = "filled";
    return;
  }

  if (newOrder.orderType === "market") {
    newOrder.status = "cancelled"; // market never rests
    if (newOrder.side === "buy") {
      const refund = lockAmount - spent;
      user.balance.locked -= refund;
      user.balance.total += refund;
    } else {
      const holding = user.balance.stocks[symbol];
      if (holding) {
        holding.locked -= remainingQty;
        holding.qty += remainingQty;
      }
    }
    return;
  }

  // limit leftover rests
  newOrder.status = (newOrder.filledQty ?? 0) > 0 ? "partially_filled" : "open";
  const restingLevels = newOrder.side === "buy" ? book.bids : book.asks;
  const ascending = newOrder.side === "sell";
  const priceNum = Number(newOrder.price);

  let idx = findPriceIndex(restingLevels, priceNum, ascending);
  if (idx === -1) {
    insertLevelSorted(
      restingLevels,
      { price: priceNum, qty: 0, orders: [] },
      ascending,
    );
    idx = findPriceIndex(restingLevels, priceNum, ascending);
  }
  restingLevels[idx]!.qty += remainingQty;
  restingLevels[idx]!.orders.push({
    orderId: newOrder.id,
    userId: newOrder.userId,
    qty: remainingQty,
    filledQty: 0,
  });
}

async function startEngineForSymbol(
  symbol: string,
  users: User[],
  orderBook: OrderBook,
) {
  const findUser = (id: string) => users.find((u) => u.id === id);

  new Worker<OrderJobData, OrderJobResult>(
    `orders-${symbol}`,
    async (job) => {
      console.log("job",job);
      
      const { userId, side, orderType, price, qty } = job.data;

      const user = findUser(userId);
      if (!user) return { error: "User not found", status: 404 };

      const book = orderBook[symbol];
      if (!book) return { error: "No order book for this stock", status: 500 };

      // ---- lock balance / stock ----
      let lockAmount = 0;
      if (side === "buy") {
        lockAmount =
          orderType === "limit"
            ? price! * qty
            : estimateMarketCost(book.asks, qty);
        if (user.balance.total < lockAmount)
          return { error: "Not enough funds", status: 400 };
        user.balance.total -= lockAmount;
        user.balance.locked += lockAmount;
      } else {
        const holding = user.balance.stocks[symbol];
        if (!holding || holding.qty < qty)
          return { error: "Not enough stocks", status: 400 };
        holding.qty -= qty;
        holding.locked += qty;
      }

      const newOrder: Order = {
        id: crypto.randomUUID(),
        userId,
        stockId: symbol,
        side,
        orderType,
        price: orderType === "limit" ? String(price) : "0",
        qty,
        filledQty: 0,
        status: "open",
        timestamp: Date.now(),
      };

      const oppositeLevels = side === "buy" ? book.asks : book.bids;
      const { remainingQty, spent, newFills } = matchOrder(
        newOrder,
        oppositeLevels,
        user,
        findUser,
      );

      resolveLeftover(
        newOrder,
        remainingQty,
        spent,
        lockAmount,
        book,
        user,
        symbol,
      );

      return { order: newOrder };
    },
    { connection: redis, concurrency: 1 }, // <-- single consumer, this is the whole guarantee
  );

  console.log(`Matching engine started for ${symbol}`);
}

async function main() {
  const { users, orderBook, stocks } = await loadState();
   console.log("state is loaded",users,orderBook,stocks);
   console.log("orders",orderBook);
   
   
  for (const stock of stocks) {
    console.log("starting engine called");
    
    await startEngineForSymbol(stock.symbol, users, orderBook);
  }
}

main().catch((err) => {
  console.error("Matching engine failed to start:", err);
  process.exit(1);
});
