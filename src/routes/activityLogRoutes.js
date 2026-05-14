import express from "express";
import { getActivityLogs } from "../controllers/activityLogController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireRole("master", "admin"), requireActiveSubscription, getActivityLogs);

export default router;