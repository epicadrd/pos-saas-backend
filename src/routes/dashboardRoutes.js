import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getDashboardSummary } from "../controllers/dashboardController.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getDashboardSummary);

export default router;