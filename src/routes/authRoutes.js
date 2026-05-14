import express from "express";
import {
  login,
  logout,
  me,
  refresh,
  register,
  updateTenant,
  verifyEmail,
  resendVerificationEmail,
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";
import {
  authRateLimit,
  loginSecurityGuard,
} from "../middlewares/authSecurityMiddleware.js";

const router = express.Router();

router.post("/register", authRateLimit, register);
router.post("/login", authRateLimit, loginSecurityGuard, login);

router.get("/me", me);
router.post("/refresh", authRateLimit, refresh);
router.post("/logout", logout);
router.patch("/tenant", protect, updateTenant);
router.get("/verify-email/:token", verifyEmail);
router.post("/resend-verification", authRateLimit, resendVerificationEmail);

export default router;