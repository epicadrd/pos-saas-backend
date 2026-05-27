import express from "express";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import {
  getAccountSettings,
  updateAccountSettings,
} from "../controllers/accountSettingsController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, requireRole('master'), getAccountSettings);
router.put("/", protect, requireActiveSubscription, requireRole('master'), updateAccountSettings);

export default router;