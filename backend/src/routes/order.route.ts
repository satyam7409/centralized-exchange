import { Router } from "express";
import asynchandler from "../utils/asynchandler.js";
import { createOrder } from "../controllers/order.controller.js";

const route = Router();

route.post("/orders", asynchandler(createOrder));

export default route;
