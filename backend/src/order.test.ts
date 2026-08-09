// order.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, users, orderBook, fills, orders } from "./index.js";
// ^ you'll need to export `app`, `users`, `orderBook`, `fills`, `orders` from index.ts for this to work

function resetState() {
  users.length = 0;
  users.push(
    { id: "u1", userName: "Satyam", balance: { total: 10000, locked: 0, stocks: { RELIANCE: { qty: 10, locked: 0 } } } },
    { id: "u2", userName: "Rahul", balance: { total: 10000, locked: 0, stocks: { RELIANCE: { qty: 10, locked: 0 } } } }
  );
  orderBook.RELIANCE.asks = [];
  orderBook.RELIANCE.bids = [];
  fills.length = 0;
  orders.length = 0;
}

describe("POST /order", () => {
  beforeEach(resetState);

  it("rests a limit sell with no match", async () => {
    const res = await request(app)
      .post("/order")
      .send({ userId: "u1", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 5 });

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("open");
    expect(res.body.order.filledQty).toBe(0);
    expect(orderBook.RELIANCE.asks).toHaveLength(1);
    expect(orderBook.RELIANCE.asks[0]).toMatchObject({ price: 300, qty: 5 });
  });

  it("fully matches an exact limit order", async () => {
    await request(app).post("/order").send({ userId: "u1", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 5 });

    const res = await request(app)
      .post("/order")
      .send({ userId: "u2", side: "buy", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 5 });

    expect(res.body.order.status).toBe("filled");
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({ price: "300", qty: 5 });
    expect(orderBook.RELIANCE.asks).toHaveLength(0); // level fully consumed

    const seller = users.find((u) => u.id === "u1")!;
    const buyer = users.find((u) => u.id === "u2")!;
    expect(seller.balance.total).toBe(10000 + 1500); // received 300*5
    expect(seller.balance.stocks.RELIANCE.locked).toBe(0);
    expect(buyer.balance.stocks.RELIANCE.qty).toBe(15); // 10 + 5
    expect(buyer.balance.locked).toBe(0); // fully spent, nothing left locked
  });

  it("price improvement: buy limit above ask fills at the ask price, not the bid price", async () => {
    await request(app).post("/order").send({ userId: "u1", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 5 });

    const res = await request(app)
      .post("/order")
      .send({ userId: "u2", side: "buy", orderType: "limit", symbol: "RELIANCE", price: 305, qty: 5 });

    expect(res.body.order.status).toBe("filled");
    expect(fills[0].price).toBe("300"); // NOT 305
  });

  it("partial fill: leftover rests on the book", async () => {
    await request(app).post("/order").send({ userId: "u1", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 5 });

    const res = await request(app)
      .post("/order")
      .send({ userId: "u2", side: "buy", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 8 });

    expect(res.body.order.status).toBe("partially_filled");
    expect(res.body.order.filledQty).toBe(5);
    expect(orderBook.RELIANCE.bids).toHaveLength(1);
    expect(orderBook.RELIANCE.bids[0]).toMatchObject({ price: 300, qty: 3 });
  });

  it("limit buy too low just rests, never matches", async () => {
    await request(app).post("/order").send({ userId: "u1", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 5 });

    const res = await request(app)
      .post("/order")
      .send({ userId: "u2", side: "buy", orderType: "limit", symbol: "RELIANCE", price: 298, qty: 10 });

    expect(res.body.order.status).toBe("open");
    expect(res.body.order.filledQty).toBe(0);
    expect(orderBook.RELIANCE.bids).toHaveLength(1);
    expect(orderBook.RELIANCE.bids[0].price).toBe(298);
    expect(orderBook.RELIANCE.asks).toHaveLength(1); // untouched — u1's ask still resting
  });

  it("market buy sweeps multiple price levels", async () => {
    await request(app).post("/order").send({ userId: "u1", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 3 });
    // seed a third user for the second price level
    users.push({ id: "u3", userName: "Extra", balance: { total: 10000, locked: 0, stocks: { RELIANCE: { qty: 10, locked: 0 } } } });
    await request(app).post("/order").send({ userId: "u3", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 301, qty: 5 });

    const res = await request(app)
      .post("/order")
      .send({ userId: "u2", side: "buy", orderType: "market", symbol: "RELIANCE", qty: 6 });

    expect(res.body.order.status).toBe("filled"); // 3 + 5 = 8 available, 6 requested, fully covered
    expect(fills).toHaveLength(2); // one fill per price level swept
    expect(fills[0].price).toBe("300");
    expect(fills[1].price).toBe("301");
  });

  it("market buy cancels unfilled remainder and refunds exact unused lock", async () => {
    await request(app).post("/order").send({ userId: "u1", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 5 });

    const buyer = users.find((u) => u.id === "u2")!;
    const totalBefore = buyer.balance.total;

    const res = await request(app)
      .post("/order")
      .send({ userId: "u2", side: "buy", orderType: "market", symbol: "RELIANCE", qty: 10 });

    expect(res.body.order.status).toBe("cancelled");
    expect(res.body.order.filledQty).toBe(5);
    expect(buyer.balance.locked).toBe(0); // no leftover lock
    expect(buyer.balance.total).toBe(totalBefore - 1500); // only paid for the 5 actually filled
  });

  it("rejects buy with insufficient funds, no state mutated", async () => {
    const buyer = users.find((u) => u.id === "u2")!;
    const before = JSON.stringify(buyer.balance);

    const res = await request(app)
      .post("/order")
      .send({ userId: "u2", side: "buy", orderType: "limit", symbol: "RELIANCE", price: 100000, qty: 1 });

    expect(res.status).toBe(400);
    expect(JSON.stringify(buyer.balance)).toBe(before); // untouched
  });

  it("rejects sell with insufficient stock", async () => {
    const res = await request(app)
      .post("/order")
      .send({ userId: "u1", side: "sell", orderType: "limit", symbol: "RELIANCE", price: 300, qty: 999 });

    expect(res.status).toBe(400);
  });
});