import express from "express";
import { handleStripeWebhook } from "../controllers/webhookController.js";
import { handleEcfWebhook } from "../controllers/receivedDocumentController.js";

const router = express.Router();

router.post(
  "/stripe",
  express.raw({ type: "*/*" }),
  handleStripeWebhook
);

router.post(
  "/ecf/:tenantId",
  express.raw({ type: "*/*", limit: "8mb" }),
  handleEcfWebhook
);

export default router;