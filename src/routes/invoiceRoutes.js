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

const router = express.Router();

router.get("/", protect, getInvoices);
router.get("/:id", protect, getInvoiceById);

router.post("/", protect, createInvoice);

router.put("/:id/draft", protect, updateDraftInvoice);
router.patch("/:id/issue", protect, issueDraftInvoice);
router.patch("/:id/cancel", protect, cancelInvoice);

router.delete("/:id", protect, deleteInvoice);

router.patch("/:id/mark-paid", protect, markInvoiceAsPaid);

export default router;