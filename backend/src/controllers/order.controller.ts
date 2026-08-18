import { users, stocks, orderBook, orders, fills } from "../index.js";
import { ApiError } from "../utils/ApiError.js";
import { v4 as uuidv4 } from "uuid";
import { Order, PriceLevel } from "../types.js";
import { matchOrder } from "../matching/match.js";
import {Request,Response} from "express"
import { orderQueue } from "../config/redis.js";
import { ApiResponse } from "../utils/ApiResponse.js";


const createOrder = async (req: Request, res: Response) => {
  const { userId, side, orderType, symbol, price, qty } = req.body;

  const user = users.find((x) => x.id === userId);
  if (!user) throw new ApiError(404, "user not found");

  const stock = stocks.find((x) => x.symbol === symbol);
  if (!stock) throw new ApiError(404, "stock not found");

  if (!qty || qty <= 0) throw new ApiError(404, "Invalid Quanity");
  if (orderType === "limit" && (!price || price <= 0)) {
    throw new ApiError(500, "Limit order requires a valid price");
  }

  const book = orderBook[symbol];
  if (!book) throw new ApiError(500, "No order book for this stock");

  // ---- lock balance / stock ----
  let lockAmount = 0;
  if (side === "buy") {
    lockAmount =
      orderType === "limit" ? price! * qty : estimateMarketCost(book.asks, qty);
    if (user.balance.total < lockAmount)
      throw new ApiError(400,"Not enough funds")
    user.balance.total -= lockAmount;
    user.balance.locked += lockAmount;
  } else {
    const holding = user.balance.stocks[symbol];
    if (!holding || holding.qty < qty)
      throw new ApiError(400,"Not enough stocks")
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
  // orders.push(newOrder);


  // ---- match ----
  const findUser = (id: string) => users.find((u) => u.id === id);
  const oppositeLevels = side === "buy" ? book.asks : book.bids;
  const { remainingQty, spent } = matchOrder(
    newOrder,
    oppositeLevels,
    user,
    findUser,
  );

  orderQueue.add("match-order",{newOrder,oppositeLevels,user,findUser});

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

  return res.status(200).json(new ApiResponse(200,{newOrder}))

  //response as json of matching
};


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


export {createOrder};