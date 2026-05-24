import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import {getAccountsPayable, markPurchaseOrderAsPaid} from "../controllers/accountsPayableController.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getAccountsPayable);
router.patch("/:id/mark-paid", protect, requireActiveSubscription, markPurchaseOrderAsPaid);

export default router;