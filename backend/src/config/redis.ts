import { Redis } from "ioredis";
import { Queue,QueueEvents } from "bullmq";

export const redis = new Redis({ host: "localhost", port: 6379,maxRetriesPerRequest: null});

const queues = new Map<string,Queue>();
const queueEventsMap = new Map<string,QueueEvents>();


function queueName(symbol: string) {
  return `orders-${symbol}`;
}

export function getOrderQueue(symbol: string): Queue {
  if (!queues.has(symbol)) {
    queues.set(symbol, new Queue(queueName(symbol), { connection: redis }));
  }
  return queues.get(symbol)!;
}

export function getQueueEvents(symbol: string): QueueEvents {
  if (!queueEventsMap.has(symbol)) {
    queueEventsMap.set(symbol, new QueueEvents(queueName(symbol), { connection: redis }));
  }
  return queueEventsMap.get(symbol)!;
}