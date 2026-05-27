import express from "express";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { getReportsOverview } from "../controllers/reportController.js";

const router = express.Router();

router.get(
  "/overview",
  protect,
  requireActiveSubscription,
  requireRole("master", "admin"),
  getReportsOverview
);

export default router;