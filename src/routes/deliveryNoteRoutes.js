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
import { requirePlanFeature, requireCashRegisterLimit,} from "../middlewares/planMiddleware.js";

const router = express.Router();

router.get("/", protect, requirePlanFeature("deliveryNotes"), requireActiveSubscription, getDeliveryNotes);
router.get("/:id", protect,requirePlanFeature("deliveryNotes"),  requireActiveSubscription, getDeliveryNoteById);

router.post("/", protect, requirePlanFeature("deliveryNotes"), requireActiveSubscription, createDeliveryNote);

router.patch("/:id/issue", protect, requirePlanFeature("deliveryNotes"), requireActiveSubscription, issueDeliveryNote);
router.patch("/:id/delivered", protect, requirePlanFeature("deliveryNotes"), requireActiveSubscription,  markDeliveryNoteDelivered);
router.patch("/:id/cancel", protect, requirePlanFeature("deliveryNotes"), requireActiveSubscription, cancelDeliveryNote);

router.post("/:id/convert-to-invoice", protect, requirePlanFeature("deliveryNotes"), requireActiveSubscription, convertDeliveryNoteToInvoice);

router.delete("/:id", protect, requirePlanFeature("deliveryNotes"), requireActiveSubscription, deleteDeliveryNote);

export default router;