import { publisher } from "../config/redis.js";
import type { Order, Fill } from "../types.js";

export function publishOrderbookUpdate(symbol: string, book: { asks: any[]; bids: any[] }) {
  const depth = {
    asks: book.asks.map((l) => ({ price: l.price, qty: l.qty })),
    bids: book.bids.map((l) => ({ price: l.price, qty: l.qty })),
  };
  publisher.publish(`orderbook:${symbol}`, JSON.stringify({ type: "orderbook", data: depth }));
}

export function publishTrades(symbol: string, newFills: Fill[]) {
  if (newFills.length === 0) return;
  publisher.publish(`trades:${symbol}`, JSON.stringify({ type: "trades", data: newFills }));
}

export function publishUserUpdate(userId: string, order: Order) {
  publisher.publish(`user:${userId}`, JSON.stringify({ type: "order_update", data: order }));
}