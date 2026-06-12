import express from "express";
import { getActivityLogs } from "../controllers/activityLogController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";
import { requirePlanFeature } from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get("/", protect, requirePlanFeature("activityLog"), requireRole("master", "admin"), requireActiveSubscription, getActivityLogs);

export default router;