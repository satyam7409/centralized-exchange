import express from "express";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import OrderRoute from "./routes/order.route.js";

const app = express();
app.use(express.json());


app.use("/order", OrderRoute);

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

// app.get("/stocks", (req, res) => {
//   res.json(stocks);
// });

// --- User data ---
app.get("/balance", (req, res) => {
  // return BALANCES[userId] for the authed user
});

app.use(errorMiddleware);
app.listen(8080, () => {
  console.log(`Server is running at http://localhost:8080`);
});
