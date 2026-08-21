import type { PriceLevel } from "../types.js";

export function estimateMarketCost(levels: PriceLevel[], qty: number): number {
  let remaining = qty, cost = 0;
  for (const level of levels) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, level.qty);
    cost += take * level.price;
    remaining -= take;
  }
  return cost;
}

export function findPriceIndex(levels: PriceLevel[], price: number, ascending: boolean): number {
  let lo = 0, hi = levels.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (levels[mid]!.price === price) return mid;
    const shouldGoRight = ascending ? levels[mid]!.price < price : levels[mid]!.price > price;
    if (shouldGoRight) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

export function insertLevelSorted(levels: PriceLevel[], newLevel: PriceLevel, ascending: boolean) {
  let lo = 0, hi = levels.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const shouldStayBefore = ascending ? levels[mid]!.price <= newLevel.price : levels[mid]!.price >= newLevel.price;
    if (shouldStayBefore) lo = mid + 1; else hi = mid;
  }
  levels.splice(lo, 0, newLevel);
}