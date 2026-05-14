import express from "express";
import {
  getDeliveryNotes,
  getDeliveryNoteById,
  createDeliveryNote,
  issueDeliveryNote,
  markDeliveryNoteDelivered,
  cancelDeliveryNote,
  convertDeliveryNoteToInvoice,
  deleteDeliveryNote,
} from "../controllers/deliveryNoteController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {requireActiveSubscription} from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.get("/", protect, requireActiveSubscription, getDeliveryNotes);
router.get("/:id", protect, requireActiveSubscription, getDeliveryNoteById);

router.post("/", protect, requireActiveSubscription, createDeliveryNote);

router.patch("/:id/issue", protect, requireActiveSubscription, issueDeliveryNote);
router.patch("/:id/delivered", protect, requireActiveSubscription,  markDeliveryNoteDelivered);
router.patch("/:id/cancel", protect, requireActiveSubscription, cancelDeliveryNote);

router.post("/:id/convert-to-invoice", protect, requireActiveSubscription, convertDeliveryNoteToInvoice);

router.delete("/:id", protect, requireActiveSubscription, deleteDeliveryNote);

export default router;