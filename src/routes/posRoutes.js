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
  getCashSessionSummary,
  getPosUsers,
  updateCashRegisterUsers,
  getCashSessionClosures,
  getCashSessionReport,
} from "../controllers/posController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import { requireActiveSubscription } from "../middlewares/subscriptionMiddleware.js";
import { requirePlanFeature, requireCashRegisterLimit,} from "../middlewares/planMiddleware.js";

const router = express.Router();

router.use(protect);
router.use(requireActiveSubscription);
router.use(requirePlanFeature("pos"));

router.get(
  "/cash-registers",
  requireRole("master", "admin", "employee"),
  getCashRegisters
);
router.post(
  "/cash-registers",
  requireRole("master"),
  requireCashRegisterLimit,
  createCashRegister
);

router.put("/cash-registers/:id", requireRole("master"), updateCashRegister);

router.get("/sessions/open", requireRole("master", "admin", "employee"), getOpenSession);
router.post("/sessions/open", requireRole("master", "admin", "employee"), openCashSession);
router.post("/sessions/:id/close", requireRole("master", "admin", "employee"), closeCashSession);

router.get("/sales", requireRole("master", "admin"), getPosSales);
router.get("/sales/:id", requireRole("master", "admin"), getPosSaleDetail);
router.post("/sales", requireRole("master", "admin", "employee"), createPosSale);

router.get("/users", requireRole("master"), getPosUsers);
router.put("/cash-registers/:id/users", requireRole("master"), updateCashRegisterUsers);
router.get("/sessions/:id/summary", requireRole("master", "admin", "employee"), getCashSessionSummary);

router.get("/sessions/closures", requireRole("master", "admin"), getCashSessionClosures);
router.get("/sessions/:id/report", requireRole("master", "admin"), getCashSessionReport);

export default router;