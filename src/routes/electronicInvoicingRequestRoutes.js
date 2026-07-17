import express from "express";
import multer from "multer";
import {
  getElectronicInvoicingRequest,
  submitElectronicInvoicingRequest,
} from "../controllers/electronicInvoicingRequestController.js";
import {
  protect,
  requireRole,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

const uploadCertificate = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 3,
  },
  fileFilter: (req, file, callback) => {
    const fileName = String(file.originalname || "").toLowerCase();

    if (!fileName.endsWith(".p12") && !fileName.endsWith(".pfx")) {
      return callback(
        new multer.MulterError(
          "LIMIT_UNEXPECTED_FILE",
          "certificate"
        )
      );
    }

    callback(null, true);
  },
});

router.get(
  "/request",
  protect,
  requireRole("master"),
  getElectronicInvoicingRequest
);

router.post(
  "/request",
  protect,
  requireRole("master"),
  uploadCertificate.single("certificate"),
  submitElectronicInvoicingRequest
);

export default router;