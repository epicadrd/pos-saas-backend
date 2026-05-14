import express from "express";
import {
  cancelInvoice,
  createInvoice,
  deleteInvoice,
  getInvoiceById,
  getInvoices,
  issueDraftInvoice,
  updateDraftInvoice,
  markInvoiceAsPaid
} from "../controllers/invoiceController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getInvoices);
router.get("/:id", protect, requireActiveSubscription, getInvoiceById);

router.post("/", protect, requireActiveSubscription,  createInvoice);

router.put("/:id/draft", protect, requireActiveSubscription,  updateDraftInvoice);
router.patch("/:id/issue", protect, requireActiveSubscription, issueDraftInvoice);
router.patch("/:id/cancel", protect, requireActiveSubscription, cancelInvoice);

router.delete("/:id", protect, requireActiveSubscription, deleteInvoice);

router.patch("/:id/mark-paid", protect, requireActiveSubscription, markInvoiceAsPaid);

export default router;