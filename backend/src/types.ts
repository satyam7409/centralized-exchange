export type OrderSide = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus = "open" | "partially_filled" | "filled" | "cancelled";

interface StockBalance {
  qty: number;
  locked: number; // reserved by open sell orders
}

interface Balance {
  total: number;
  locked: number; // cash reserved by open buy orders
  stocks: Record<string, StockBalance>; // keyed by stock symbol
}

export interface User {
  id: string;
  userName: string;
  balance: Balance;
}

export interface Order {
  id: string;
  userId: string;
  stockId: string;
  side: OrderSide;
  orderType: OrderType;
  price: string;
  qty: number;
  filledQty?: number;
  status?: OrderStatus;
  timestamp?: number;
}

export interface Stock {
  id: string;
  title: string;
  symbol: string;
}

export interface Fill {
  id: string;
  stockId: string;
  buyOrderId: string;
  sellOrderId: string;
  price: string;
  qty: number;
  timestamp: number;
}

export interface RestingOrder {
  userId: string;
  orderId: string;
  qty: number;
  filledQty: number;
}

export interface PriceLevel {
  price: number; // the price this level sits at — no more Record wrapper
  qty: number;
  orders: RestingOrder[];
}

export interface StockOrderBook {
  asks: PriceLevel[]; // sorted ascending — cheapest first
  bids: PriceLevel[]; // sorted descending — highest first
}

export type OrderBook = Record<string, StockOrderBook>;