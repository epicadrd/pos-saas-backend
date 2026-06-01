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
  forgotPassword,
  resetPassword,
  passwordResetRateLimit,
} from "../controllers/authController.js";
import { protect, requireRole } from "../middlewares/authMiddleware.js";
import {
  authRateLimit,
  loginRateLimit,
  loginSecurityGuard,
  registerRateLimit,
  refreshRateLimit,
  resendVerificationRateLimit,
} from "../middlewares/authSecurityMiddleware.js";

const router = express.Router();

router.post("/register", registerRateLimit, register);
router.post("/login", loginRateLimit, loginSecurityGuard, login);

router.get("/me", me);
router.post("/refresh", refreshRateLimit, refresh);
router.post("/logout", logout);
router.patch("/tenant", protect, requireRole("master"), updateTenant);
router.get("/verify-email/:token", authRateLimit, verifyEmail);
router.post(
  "/resend-verification",
  resendVerificationRateLimit,
  resendVerificationEmail
);

router.post("/forgot-password", passwordResetRateLimit, forgotPassword);
router.post("/reset-password/:token", passwordResetRateLimit, resetPassword);

export default router;