import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { getAccountingSummary } from "../controllers/accountingController.js";

const router = express.Router();

router.get(
  "/summary",
  protect,
  requireActiveSubscription,
  getAccountingSummary
);

export default router;