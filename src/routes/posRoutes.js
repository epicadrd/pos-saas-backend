import express from "express";
import {
  closeCashSession,
  createCashRegister,
  createPosSale,
  getCashRegisters,
  getOpenSession,
  getPosSales,
  openCashSession,
  updateCashRegister,
  getPosSaleDetail,
} from "../controllers/posController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(requireActiveSubscription);

router.get("/cash-registers", requireRole("master", "admin"), getCashRegisters);
router.post("/cash-registers", requireRole("master"), createCashRegister);
router.put("/cash-registers/:id", requireRole("master"), updateCashRegister);

router.get("/sessions/open", requireRole("master", "admin", "employee"), getOpenSession);
router.post("/sessions/open", requireRole("master", "admin", "employee"), openCashSession);
router.post("/sessions/:id/close", requireRole("master", "admin", "employee"), closeCashSession);

router.get("/sales", requireRole("master", "admin"), getPosSales);
router.get("/sales/:id", requireRole("master", "admin"), getPosSaleDetail);
router.post("/sales", requireRole("master", "admin", "employee"), createPosSale);

export default router;