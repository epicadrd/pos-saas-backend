import jwt from "jsonwebtoken";
import { Product, User } from "../models/index.js";

const getLowStockNotifications = async (tenantId) => {
  const products = await Product.findAll({
    where: {
      tenantId,
      isActive: true,
      productType: "product",
      trackStock: true,
    },
  });

  return products
    .filter((p) => Number(p.stock) <= Number(p.minStock))
    .map((p) => ({
      type: "low_stock",
      productId: p.id,
      message: `Stock bajo: ${p.name} (${p.stock} disponibles)`,
    }));
};

export const getNotifications = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const notifications = await getLowStockNotifications(tenantId);

    return res.json(notifications);
  } catch (error) {
    console.log("GET NOTIFICATIONS ERROR:", error);
    return res.status(500).json({
      message: "Error cargando notificaciones",
    });
  }
};

export const streamNotifications = async (req, res) => {
  try {
    const token = req.cookies.pos_refresh_token;

    if (!token) {
      return res.status(401).end();
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const user = await User.findOne({
      where: {
        id: decoded.id,
        tenantId: decoded.tenantId,
        isActive: true,
      },
    });

    if (!user) {
      return res.status(401).end();
    }

    const tenantId = user.tenantId;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendNotifications = async () => {
      try {
        const notifications = await getLowStockNotifications(tenantId);
        res.write(`data: ${JSON.stringify(notifications)}\n\n`);
      } catch (error) {
        console.log("SEND NOTIFICATIONS ERROR:", error);
      }
    };

    await sendNotifications();

    const interval = setInterval(sendNotifications, 5000);

    req.on("close", () => {
      clearInterval(interval);
      res.end();
    });
  } catch (error) {
    console.log("STREAM NOTIFICATIONS ERROR:", error);
    return res.status(401).end();
  }
};