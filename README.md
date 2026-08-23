# Centralized Exchange Engine

A centralized order-matching exchange (à la Binance/Backpack) built from scratch in TypeScript — covering order placement, a price-time-priority matching engine, durable persistence, crash recovery, and live order book/trade updates over WebSocket.

## Architecture

<img width="1578" height="781" alt="Screenshot 2026-08-23 191848" src="https://github.com/user-attachments/assets/910e888c-bd66-4934-9ff9-29e705009d7f" />

Client ──HTTP(place order)──> API Layer ──Order Queue──> Matching Engine
Client ──HTTP(reads)────────> API Layer ──direct query──> Postgres
Client <─WebSocket────────── API Layer <──Redis Pub/Sub── Matching Engine

Matching Engine ──loads state on boot──> Postgres
Matching Engine ──db queue──────────────> Persist Worker ──writes──> Postgres
Matching Engine ──publish (orderbook/trades/user)──> Redis Channels


**Four independent processes:**
- **API layer** — stateless Express server. Validates requests, enqueues orders, awaits the matching result via BullMQ's request/reply pattern, and serves the WebSocket layer (shares the same HTTP server/port).
- **Matching engine** — one process, one in-memory order book per symbol. The *only* process that ever mutates trading state. Runs a single-consumer (`concurrency: 1`) BullMQ worker per symbol — this is what gives price-time-priority matching its correctness guarantee, not a lock, just strict sequential processing.
- **Persist worker** — drains a separate durable queue and asynchronously writes orders, fills, and balances to Postgres. Decoupled from the matching loop so DB latency never slows down matching.
- **Redis** — backs the BullMQ queues (durability) and pub/sub channels (live broadcast).

### Why a queue, and why per-symbol

A single Node process's event loop already serializes synchronous in-memory operations — no queue is needed for correctness in a single-process setup. The queue earns its place the moment you have **multiple stateless API replicas** funneling into **one stateful matching engine per symbol**: it's the hand-off point that lets many producers (API instances) safely reach one consumer (the matching engine) without two processes racing on the same in-memory order book. Sharding by symbol (`orders-${symbol}`) means different stocks can be matched fully in parallel, potentially on different machines, since they never touch shared state.

### Crash recovery

On boot, the matching engine rebuilds its entire in-memory state from Postgres rather than starting empty:
- **Balances** are read directly as current values (not replayed from trade history) — O(number of users), not O(all-time trades).
- **Resting orders** (`OPEN`/`PARTIALLY_FILLED`) are replayed in original timestamp order to reconstruct each symbol's `PriceLevel[]` book, preserving price-time priority exactly as it existed pre-crash.

This means the matching engine's in-memory state is a cache that can always be safely rebuilt from the durable store — it's never the sole source of truth for anything.

### Live updates

The matching engine never talks to WebSocket clients directly — it publishes to three Redis channels after every processed order:
- `orderbook:<symbol>` — aggregated depth (price + qty only; individual order ownership is stripped before broadcast)
- `trades:<symbol>` — the public trade tape
- `user:<userId>` — private order-status updates for the order's owner

The API layer subscribes to whichever channels its connected clients ask for and relays messages verbatim. This decouples "something happened" from "who needs to know," and lets the WebSocket-serving layer scale independently of the matching engine.

## Stack

TypeScript · Express · BullMQ · Redis · PostgreSQL · Prisma · `ws`

## Key engineering problems solved

- **Correctness under concurrency**: replaced an unnecessary/broken queue setup (double-matching, unserializable job payloads) with a single-consumer-per-symbol design where sequential processing *is* the concurrency guarantee.
- **Persistence without blocking the hot path**: matching stays fully in-memory and synchronous; all Postgres writes happen asynchronously through a separate queue and worker.
- **Schema/runtime boundary translation**: symbol-keyed in-memory identifiers vs. UUID-keyed relational foreign keys, enum casing mismatches, and string-vs-Decimal precision handling for monetary fields — all resolved at the persistence boundary rather than leaking into either layer.
- **Crash-consistency window**: identified and addressed the race between "order matched + client acknowledged" and "durable write completed," where a crash in between could let a freshly-booted engine silently disagree with what the client was already told.
- **Privacy-aware broadcasting**: public order book/trade feeds are aggregated and stripped of individual user identity before publishing; only a user's own private channel carries their order details.

## Project structure

src/
index.ts # API layer + WebSocket server (shared HTTP server)
config/ # Redis connection, queue factories
routes/, controllers/ # HTTP order placement, validation only — no trading state
matching/match.ts # Core matching algorithm (price-time priority)
matchingEngine/
main.ts # Per-symbol worker entrypoint, owns orderBook + users in memory
loadState.ts # Boot-time reconstruction from Postgres
publish.ts # Redis pub/sub broadcast helpers
persist.ts # Enqueues durable writes
persistWorker/main.ts # Drains persist queue → Postgres via Prisma
prisma/schema.prisma # Relational schema (Order, Fill, Balance, AssetBalance, Asset, User)


## Running locally

Requires Redis and Postgres running locally.

```bash
npm install
npx prisma migrate dev

npm run dev:api        # API + WebSocket, :8080
npm run dev:matching   # Matching engine (all symbols)
npm run dev:persist    # Persist worker
```

## Known limitations / next steps

- No auth on WebSocket `subscribe_user` — needs token verification before a socket can subscribe to a given user's private channel.
- Persist worker writes (order, fills, balances) aren't yet wrapped in a single DB transaction — a crash mid-write could leave partial state.
- No snapshotting yet for matching-engine startup at scale — current replay is bounded by resting-order count, which is fine at current volume but would need periodic snapshots under much higher order-book depth.
- No authentication/authorization layer on the API yet (single hardcoded user for now).
