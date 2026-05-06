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

const router = express.Router();

router.get("/", protect, getDeliveryNotes);
router.get("/:id", protect, getDeliveryNoteById);

router.post("/", protect, createDeliveryNote);

router.patch("/:id/issue", protect, issueDeliveryNote);
router.patch("/:id/delivered", protect, markDeliveryNoteDelivered);
router.patch("/:id/cancel", protect, cancelDeliveryNote);

router.post("/:id/convert-to-invoice", protect, convertDeliveryNoteToInvoice);

router.delete("/:id", protect, deleteDeliveryNote);

export default router;