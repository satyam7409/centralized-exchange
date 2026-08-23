import {
  OrderSide,
  OrderType,
  Fill,
  User,
  PriceLevel,
  Order,
} from "../types.js";
import { v4 as uuidv4 } from "uuid";

function isPriceEligible(
  levelPrice: number,
  orderPrice: number,
  side: OrderSide,
  type: OrderType,
): boolean {
  if (type === "market") return true;
  return side === "buy" ? levelPrice <= orderPrice : levelPrice >= orderPrice;
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
): { remainingQty: number; spent: number; newFills: Fill[], touchedUserIds:Set<string> } {
  let remainingQty = order.qty;
  let spent = 0;
  let i = 0;
  const newFills: Fill[] = [];
  const touchedUserIds = new Set<string>([user.id])

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

      touchedUserIds.add(restingOrder.userId)

      const fill: Fill = {
        id: uuidv4(),
        stockId: order.stockId,
        buyOrderId: order.side === "buy" ? order.id : restingOrder.orderId,
        sellOrderId: order.side === "sell" ? order.id : restingOrder.orderId,
        price: String(level.price),
        qty: matchQty,
        timestamp: Date.now(),
      };
      newFills.push(fill); // <-- added

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

  return { remainingQty, spent, newFills,touchedUserIds};
}

export { matchOrder };
