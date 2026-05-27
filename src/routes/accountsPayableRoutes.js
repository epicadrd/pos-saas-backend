import express from "express";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import {getAccountsPayable, markPurchaseOrderAsPaid} from "../controllers/accountsPayableController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, requireRole("master", "admin"), getAccountsPayable);
router.patch("/:id/mark-paid", protect, requireActiveSubscription, requireRole("master", "admin"), markPurchaseOrderAsPaid);

export default router;