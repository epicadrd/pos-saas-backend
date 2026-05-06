import express from "express";
import {
  getNotifications,
  streamNotifications,
} from "../controllers/notificationController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/stream", streamNotifications);
router.get("/", protect, getNotifications);

export default router;