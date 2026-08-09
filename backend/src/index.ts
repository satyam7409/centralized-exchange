import express from "express";
import type {
  Stock,
  User,
  Order,
  Fill,
  OrderBook,
  PriceLevel,
  OrderSide,
  OrderType,
} from "./types.js";
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";

export const app = express();
app.use(express.json());

//In memory database

export const users: User[] = [
  {
    id: "u1",
    userName: "Satyam",
    balance: {
      total: 10000,
      locked: 0,
      stocks: {},
    },
  },
];

export const stocks: Stock[] = [
  { id: "s1", title: "Reliance Industries", symbol: "RELIANCE" },
  { id: "s2", title: "Tata Consultancy Services", symbol: "TCS" },
];

export const orders: Order[] = [];
export const fills: Fill[] = [];

export const orderBook: OrderBook = {
  RELIANCE: { asks: [], bids: [] },
  TCS: { asks: [], bids: [] },
};

//helper functions
function findPriceIndex(
  levels: PriceLevel[],
  price: number,
  ascending: boolean,
): number {
  let lo = 0,
    hi = levels.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (levels[mid]!.price === price) return mid;
    const shouldGoRight = ascending
      ? levels[mid]!.price < price
      : levels[mid]!.price > price;
    if (shouldGoRight) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

function insertLevelSorted(
  levels: PriceLevel[],
  newLevel: PriceLevel,
  ascending: boolean,
) {
  let lo = 0,
    hi = levels.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const shouldStayBefore = ascending
      ? levels[mid]!.price <= newLevel.price
      : levels[mid]!.price >= newLevel.price;
    if (shouldStayBefore) lo = mid + 1;
    else hi = mid;
  }
  levels.splice(lo, 0, newLevel);
}

function isPriceEligible(
  levelPrice: number,
  orderPrice: number,
  side: OrderSide,
  type: OrderType,
): boolean {
  if (type === "market") return true;
  return side === "buy" ? levelPrice <= orderPrice : levelPrice >= orderPrice;
}

function estimateMarketCost(levels: PriceLevel[], qty: number): number {
  let remaining = qty,
    cost = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.qty);
    cost += take * level.price;
    remaining -= take;
  }
  return cost;
}

function settleFill(fill: Fill, price: number, buyer: User, seller: User) {
  const cost = price * fill.qty;

  buyer.balance.locked -= cost;
  const buyerStock = buyer.balance.stocks[fill.stockId] ?? {
    qty: 0,
    locked: 0,
  };
  buyerStock.qty += fill.qty;
  buyer.balance.stocks[fill.stockId] = buyerStock;

  const sellerStock = seller.balance.stocks[fill.stockId];
  if (sellerStock) sellerStock.locked -= fill.qty;
  seller.balance.total += cost;
}

// ---------- matching engine — shared by buy/sell, limit/market ----------

function matchOrder(
  order: Order,
  oppositeLevels: PriceLevel[],
  user: User,
  findUser: (id: string) => User | undefined,
): { remainingQty: number; spent: number } {
  let remainingQty = order.qty;
  let spent = 0;
  let i = 0;

  while (i < oppositeLevels.length && remainingQty > 0) {
    const level = oppositeLevels[i];

    if (!level) {
      throw new Error("d");
    }
    if (
      !isPriceEligible(
        level.price,
        Number(order.price),
        order.side,
        order.orderType,
      )
    )
      break;

    for (const restingOrder of level.orders) {
      if (remainingQty <= 0) break;
      const available = restingOrder.qty - restingOrder.filledQty;
      const matchQty = Math.min(remainingQty, available);
      if (matchQty <= 0) continue;

      restingOrder.filledQty += matchQty;
      level.qty -= matchQty;
      remainingQty -= matchQty;
      order.filledQty = (order.filledQty ?? 0) + matchQty;
      spent += matchQty * level.price;

      const fill: Fill = {
        id: uuidv4(),
        stockId: order.stockId,
        buyOrderId: order.side === "buy" ? order.id : restingOrder.orderId,
        sellOrderId: order.side === "sell" ? order.id : restingOrder.orderId,
        price: String(level.price),
        qty: matchQty,
        timestamp: Date.now(),
      };
      fills.push(fill);

      const restingUser = findUser(restingOrder.userId);
      const buyer = order.side === "buy" ? user : restingUser;
      const seller = order.side === "sell" ? user : restingUser;
      if (buyer && seller) {
        settleFill(fill, level.price, buyer, seller);
      }
    }

    level.orders = level.orders.filter((o) => o.filledQty < o.qty);
    if (level.orders.length === 0) {
      oppositeLevels.splice(i, 1); // don't advance i, next level shifted in
    } else {
      i++;
    }
  }

  return { remainingQty, spent };
}

// ---------- endpoint ----------
app.post("/signup", (req, res) => {
  // const { username, password } = req.body;
  const { username, password } = req.body;
  // 1. check username not taken
  const alreadyExist = users.some((x) => x.userName === username);
  if (alreadyExist) {
    throw new Error("Username already exist");
  }
  // 2. hash password (bcrypt/argon2)

  //   const hash = bcrypt.hashSync(password, 10);
  // 3. push to USERS
  users.push({
    id: uuidv4(),
    userName: username,
    balance: { total: 0, locked: 0, stocks: {} },
  });
  console.log("Users", users);
  // 4. init BALANCES[userId] with INR: { available: 0, locked: 0 }
});

app.post("/login", (req, res) => {
  // 1. find user by username
  // 2. compare hashed password
  // 3. return JWT / session token
});

// --- Orders ---
app.post("/order", (req, res) => {
  const { userId, side, orderType, symbol, price, qty } = req.body;

  const user = users.find((x) => x.id === userId);
  if (!user) return res.status(404).json({ error: "user not found" });

  const stock = stocks.find((x) => x.symbol === symbol);
  if (!stock) return res.status(404).json({ error: "stock not found" });

  if (!qty || qty <= 0) return res.status(400).json({ error: "invalid qty" });
  if (orderType === "limit" && (!price || price <= 0)) {
    return res
      .status(400)
      .json({ error: "limit order requires a valid price" });
  }

  const book = orderBook[symbol];
  if (!book)
    return res.status(500).json({ error: "no order book for this stock" });

  // ---- lock balance / stock ----
  let lockAmount = 0;
  if (side === "buy") {
    lockAmount =
      orderType === "limit" ? price! * qty : estimateMarketCost(book.asks, qty);
    if (user.balance.total < lockAmount)
      return res.status(400).json({ error: "not enough funds" });
    user.balance.total -= lockAmount;
    user.balance.locked += lockAmount;
  } else {
    const holding = user.balance.stocks[symbol];
    if (!holding || holding.qty < qty)
      return res.status(400).json({ error: "not enough stock" });
    holding.qty -= qty;
    holding.locked += qty;
  }

  // ---- create order ----
  const newOrder: Order = {
    id: uuidv4(),
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
  orders.push(newOrder);

  // ---- match ----
  const findUser = (id: string) => users.find((u) => u.id === id);
  const oppositeLevels = side === "buy" ? book.asks : book.bids;
  const { remainingQty, spent } = matchOrder(
    newOrder,
    oppositeLevels,
    user,
    findUser,
  );

  // ---- resolve leftover ----
  if (remainingQty === 0) {
    newOrder.status = "filled";
  } else if (orderType === "market") {
    newOrder.status = "cancelled"; // market never rests
    if (side === "buy") {
      const refund = lockAmount - spent; // exact, since lockAmount was saved at lock time
      user.balance.locked -= refund;
      user.balance.total += refund;
    } else {
      const holding = user.balance.stocks[symbol];
      if (holding) {
        holding.locked -= remainingQty;
        holding.qty += remainingQty;
      }
    }
  } else {
    // limit leftover rests, never auto-cancels
    newOrder.status =
      (newOrder.filledQty ?? 0) > 0 ? "partially_filled" : "open";
    const restingLevels = side === "buy" ? book.bids : book.asks;
    const ascending = side === "sell";
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
      userId,
      qty: remainingQty,
      filledQty: 0,
    });
  }

  res.json({ order: newOrder });
});

app.delete("/order/:orderId", (req, res) => {
  // 1. find order, check ownership
  // 2. remove from ORDERBOOK price level
  // 3. unlock remaining reserved balance
  // 4. mark status = CANCELLED
});

app.get("/orders", (req, res) => {
  // query: ?status=OPEN  (or all)
  // return current user's orders
});

// --- Market data ---
app.get("/orderbook/:symbol", (req, res) => {
  // return aggregated depth — totalQty per price level for bids and asks
  // (don't expose individual userIds to other users)
});

app.get("/fills/:symbol", (req, res) => {
  // recent trades for this stock — the "tape"
});

app.get("/stocks", (req, res) => {
  res.json(stocks);
});

// --- User data ---
app.get("/balance", (req, res) => {
  // return BALANCES[userId] for the authed user
});

if (process.env.NODE_ENV !== "test") {
  app.listen(8080, () => {
    console.log(`Server is running at http://localhost:8080`);
  });
}
