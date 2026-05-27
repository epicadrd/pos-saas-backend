import express from "express";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { getAccountingSummary } from "../controllers/accountingController.js";

const router = express.Router();

router.get(
  "/summary",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  getAccountingSummary
);

export default router;