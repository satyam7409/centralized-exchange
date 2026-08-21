import type { User, OrderBook, Stock } from "../types.js";

export async function loadState(): Promise<{ users: User[]; orderBook: OrderBook; stocks: Stock[] }> {
  // TODO: replace with prisma queries once persistence is wired in
  const users: User[] = [
    { id: "u1", userName: "Satyam", balance: { total: 10000, locked: 0, stocks: {} } },
  ];

  const stocks: Stock[] = [
    { id: "s1", title: "Reliance Industries", symbol: "RELIANCE" },
    { id: "s2", title: "Tata Consultancy Services", symbol: "TCS" },
  ];

  const orderBook: OrderBook = Object.fromEntries(
    stocks.map((s) => [s.symbol, { asks: [], bids: [] }]),
  );

  return { users, orderBook, stocks };
}