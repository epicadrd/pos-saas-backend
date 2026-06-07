import crypto from "crypto";
import { Product, Tenant } from "../models/index.js";

const buildCatalogUrl = (token) => {
  const appUrl = process.env.FRONTEND_URL || process.env.APP_URL || "https://app.corexrd.com";
  return `${appUrl.replace(/\/$/, "")}/catalogo/${token}`;
};

export const getCatalogSettings = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.user.tenantId);

    if (!tenant) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    return res.json({
      catalogEnabled: tenant.catalogEnabled !== false,
      catalogToken: tenant.catalogToken || null,
      catalogUrl: tenant.catalogToken ? buildCatalogUrl(tenant.catalogToken) : null,
    });
  } catch (error) {
    console.log("GET CATALOG SETTINGS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo catálogo" });
  }
};

export const generateCatalogLink = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.user.tenantId);

    if (!tenant) {
      return res.status(404).json({ message: "Empresa no encontrada" });
    }

    const token = tenant.catalogToken || crypto.randomBytes(24).toString("hex");

    await tenant.update({
      catalogToken: token,
      catalogEnabled: true,
    });

    return res.json({
      catalogEnabled: true,
      catalogToken: token,
      catalogUrl: buildCatalogUrl(token),
    });
  } catch (error) {
    console.log("GENERATE CATALOG LINK ERROR:", error);
    return res.status(500).json({ message: "Error generando link del catálogo" });
  }
};

export const getPublicCatalog = async (req, res) => {
  try {
    const { token } = req.params;

    const tenant = await Tenant.findOne({
      where: { catalogToken: token, catalogEnabled: true },
      attributes: ["id", "businessName", "phone", "email", "address", "logoDataUrl", "primaryColor"],
    });

    if (!tenant) {
      return res.status(404).json({ message: "Catálogo no disponible" });
    }

    const products = await Product.findAll({
      where: {
        tenantId: tenant.id,
        isActive: true,
        showInCatalog: true,
      },
      attributes: ["id", "name", "description", "category", "salePrice", "unit", "imageDataUrl", "productType"],
      order: [["category", "ASC"], ["name", "ASC"]],
    });

    return res.json({
      business: tenant,
      products,
    });
  } catch (error) {
    console.log("GET PUBLIC CATALOG ERROR:", error);
    return res.status(500).json({ message: "Error cargando catálogo" });
  }
};