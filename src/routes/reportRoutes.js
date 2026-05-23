import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { getReportsOverview } from "../controllers/reportController.js";

const router = express.Router();

router.get("/overview", protect, requireActiveSubscription, getReportsOverview);

export default router;