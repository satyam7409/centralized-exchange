import prisma from "../db/prisma.js";
import {User,OrderBook} from "../types.js"
import { findPriceIndex, insertLevelSorted } from "./helper.js";


export async function loadState() {
  const dbUsers = await prisma.user.findMany({
    include: { balance: { include: { assets: { include: { asset: true } } } } },
  });

  const users: User[] = dbUsers.map((u:any) => ({
    id: u.id,
    userName: u.name,
    balance: {
      total: Number(u.balance!.total),
      locked: Number(u.balance!.locked),
      stocks: Object.fromEntries(
        u.balance!.assets.map((a:any) => [a.asset.symbol, { qty: Number(a.qty), locked: Number(a.locked) }]),
      ),
    },
  }));

  const stocks = await prisma.asset.findMany();
  const orderBook: OrderBook = Object.fromEntries(stocks.map((s:any) => [s.symbol, { asks: [], bids: [] }]));

  const openOrders = await prisma.order.findMany({
    where: { status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    include: { asset: true },
    orderBy: { timestamp: "asc" },
  });


for (const o of openOrders) {
  const symbol = o.asset.symbol;
  const book = orderBook[symbol];
  if (!book) continue; // shouldn't happen, but guard anyway

  const side = o.side === "BUY" ? "buy" : "sell";
  const restingLevels = side === "buy" ? book.bids : book.asks;
  const ascending = side === "sell"; // asks ascending, bids descending — same convention as live matching
  const priceNum = Number(o.price);
  const remainingQty = o.qty - o.filledQty; // only the unfilled portion actually rests

  if (remainingQty <= 0) continue; // fully filled orders shouldn't be OPEN/PARTIALLY_FILLED anyway, but guard

  let idx = findPriceIndex(restingLevels, priceNum, ascending);
  if (idx === -1) {
    insertLevelSorted(restingLevels, { price: priceNum, qty: 0, orders: [] }, ascending);
    idx = findPriceIndex(restingLevels, priceNum, ascending);
  }

  restingLevels[idx]!.qty += remainingQty;
  restingLevels[idx]!.orders.push({
    orderId: o.id,
    userId: o.userId,
    qty: o.qty,           // original order qty
    filledQty: o.filledQty, // how much of it is already filled
  });
}

  return { users, orderBook, stocks };
}