import express from "express";
import {
  createFiscalSequenceHandler,
  deleteFiscalSequenceHandler,
  getFiscalSequences,
  importFiscalSequencesHandler,
  updateFiscalSequenceExpirationHandler,
  updateFiscalSequenceStatus,
} from "../controllers/fiscalSequenceController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.use(protect, requireActiveSubscription, requireRole("master", "admin"));

router.get("/", getFiscalSequences);
router.post("/", createFiscalSequenceHandler);
router.post("/import", importFiscalSequencesHandler);
router.patch("/:id/status", updateFiscalSequenceStatus);
router.patch("/:id/expiration", updateFiscalSequenceExpirationHandler);
router.delete("/:id", deleteFiscalSequenceHandler);

export default router;
