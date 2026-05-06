import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import morgan from "morgan";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import billingRoutes from "./routes/billingRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import invoiceRoutes from "./routes/invoiceRoutes.js";
import quoteRoutes from "./routes/quoteRoutes.js";
import deliveryNoteRoutes from "./routes/deliveryNoteRoutes.js";
import receiptRoutes from "./routes/receiptRoutes.js";
import purchaseOrderRoutes from "./routes/purchaseOrderRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import supplierRoutes from "./routes/supplierRoutes.js";
import { sequelize } from "./models/index.js";
import userRoutes from "./routes/userRoutes.js";

dotenv.config();

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.APP_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(cookieParser());

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(morgan("dev"));

app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/webhooks", webhookRoutes);

app.use("/api/products", productRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/delivery-notes", deliveryNoteRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/users", userRoutes);



app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "POS SaaS Backend funcionando correctamente",
  });
});

const PORT = process.env.PORT || 8080;

const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Base de datos conectada");

    await sequelize.sync();
    console.log("✅ Modelos sincronizados");

    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ Error iniciando servidor:", error);
  }
};

startServer();