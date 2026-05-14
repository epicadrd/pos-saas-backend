import express from "express";
import {
  getNotifications,
  streamNotifications,
} from "../controllers/notificationController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/stream", protect, requireActiveSubscription, streamNotifications);
router.get("/", protect, requireActiveSubscription, getNotifications);

export default router;