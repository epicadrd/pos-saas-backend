import crypto from "crypto";
import { Op } from "sequelize";
import { Product, ProductCatalogImage, Tenant } from "../models/index.js";

const MAX_ADDITIONAL_IMAGES = 3;
const MAX_IMAGE_DATA_URL_LENGTH = 2_000_000;

const buildCatalogUrl = (token) => {
  const appUrl = process.env.APP_URL || "https://app.aventrard.com";
  return `${appUrl.replace(/\/$/, "")}/catalogo/${token}`;
};

const isValidImageDataUrl = (value) =>
  typeof value === "string" &&
  /^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i.test(value) &&
  value.length <= MAX_IMAGE_DATA_URL_LENGTH;

export const getCatalogSettings = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.user.tenantId);
    if (!tenant) return res.status(404).json({ message: "Empresa no encontrada" });

    return res.json({
      catalogEnabled: tenant.catalogEnabled !== false,
      catalogToken: tenant.catalogToken || null,
      catalogUrl: tenant.catalogToken ? buildCatalogUrl(tenant.catalogToken) : null,
    });
  } catch (error) {
    console.log("GET CATALOG SETTINGS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo catÃ¡logo" });
  }
};

export const generateCatalogLink = async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.user.tenantId);
    if (!tenant) return res.status(404).json({ message: "Empresa no encontrada" });

    const token = tenant.catalogToken || crypto.randomBytes(24).toString("hex");
    await tenant.update({ catalogToken: token, catalogEnabled: true });

    return res.json({
      catalogEnabled: true,
      catalogToken: token,
      catalogUrl: buildCatalogUrl(token),
    });
  } catch (error) {
    console.log("GENERATE CATALOG LINK ERROR:", error);
    return res.status(500).json({ message: "Error generando link del catÃ¡logo" });
  }
};

export const getProductCatalogImages = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const productId = Number(req.params.productId);
    const product = await Product.findOne({
      where: { id: productId, tenantId, isActive: true, productType: "product" },
      attributes: ["id", "name", "imageDataUrl"],
    });

    if (!product) return res.status(404).json({ message: "Producto no encontrado" });

    const images = await ProductCatalogImage.findAll({
      where: { productId, tenantId },
      attributes: ["id", "imageDataUrl", "position"],
      order: [["position", "ASC"]],
    });

    return res.json({
      product,
      images,
      maxAdditionalImages: MAX_ADDITIONAL_IMAGES,
      maxTotalImages: MAX_ADDITIONAL_IMAGES + 1,
    });
  } catch (error) {
    console.log("GET PRODUCT CATALOG IMAGES ERROR:", error);
    return res.status(500).json({ message: "Error cargando las imÃ¡genes" });
  }
};

export const updateMainCatalogImage = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const productId = Number(req.params.productId);
    const { imageDataUrl } = req.body;

    if (!isValidImageDataUrl(imageDataUrl)) {
      return res.status(400).json({
        message: "La imagen no es vÃ¡lida o supera el tamaÃ±o permitido",
      });
    }

    const product = await Product.findOne({
      where: {
        id: productId,
        tenantId,
        isActive: true,
        productType: "product",
      },
    });

    if (!product) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    await product.update({ imageDataUrl });

    return res.json({
      message: "Imagen principal actualizada correctamente",
      imageDataUrl: product.imageDataUrl,
    });
  } catch (error) {
    console.log("UPDATE MAIN CATALOG IMAGE ERROR:", error);
    return res.status(500).json({
      message: "Error actualizando la imagen principal",
    });
  }
};

export const addCatalogImage = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const productId = Number(req.params.productId);
    const { imageDataUrl } = req.body;

    if (!isValidImageDataUrl(imageDataUrl)) {
      return res.status(400).json({ message: "La imagen no es vÃ¡lida o supera el tamaÃ±o permitido" });
    }

    const product = await Product.findOne({
      where: { id: productId, tenantId, isActive: true, productType: "product" },
      attributes: ["id"],
    });
    if (!product) return res.status(404).json({ message: "Producto no encontrado" });

    const imageCount = await ProductCatalogImage.count({ where: { productId, tenantId } });
    if (imageCount >= MAX_ADDITIONAL_IMAGES) {
      return res.status(400).json({ message: "Cada producto admite un mÃ¡ximo de 4 imÃ¡genes contando la principal" });
    }

    const maxPosition = await ProductCatalogImage.max("position", { where: { productId, tenantId } });
    const image = await ProductCatalogImage.create({
      tenantId,
      productId,
      imageDataUrl,
      position: Number(maxPosition || 0) + 1,
    });

    return res.status(201).json({ message: "Imagen agregada correctamente", image });
  } catch (error) {
    console.log("ADD CATALOG IMAGE ERROR:", error);
    return res.status(500).json({ message: "Error agregando la imagen" });
  }
};

export const deleteCatalogImage = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const productId = Number(req.params.productId);
    const imageId = Number(req.params.imageId);
    const image = await ProductCatalogImage.findOne({
      where: { id: imageId, productId, tenantId },
    });

    if (!image) return res.status(404).json({ message: "Imagen no encontrada" });
    await image.destroy();

    const remainingImages = await ProductCatalogImage.findAll({
      where: { productId, tenantId },
      order: [["position", "ASC"]],
    });
    for (let index = 0; index < remainingImages.length; index += 1) {
      await remainingImages[index].update({ position: index + 1 });
    }

    return res.json({ message: "Imagen eliminada correctamente" });
  } catch (error) {
    console.log("DELETE CATALOG IMAGE ERROR:", error);
    return res.status(500).json({ message: "Error eliminando la imagen" });
  }
};

export const getPublicCatalog = async (req, res) => {
  try {
    const cleanToken = String(req.params.token || "").trim();
    const tenant = await Tenant.findOne({
      where: { catalogToken: cleanToken },
      attributes: ["id", "businessName", "phone", "email", "address", "logoDataUrl", "primaryColor", "catalogEnabled", "country"],
    });

    if (!tenant || tenant.catalogEnabled === false || tenant.catalogEnabled === 0) {
      return res.status(404).json({ message: "CatÃ¡logo no disponible" });
    }

    const products = await Product.findAll({
      where: {
        tenantId: tenant.id,
        isActive: true,
        showInCatalog: true,
        productType: "product",
        stock: { [Op.gt]: 0 },
      },
      attributes: ["id", "name", "description", "category", "salePrice", "unit", "stock", "imageDataUrl", "productType"],
      include: [{
        model: ProductCatalogImage,
        as: "catalogImages",
        attributes: ["id", "imageDataUrl", "position"],
        required: false,
      }],
      order: [
        ["category", "ASC"],
        ["name", "ASC"],
        [{ model: ProductCatalogImage, as: "catalogImages" }, "position", "ASC"],
      ],
    });

    return res.json({ business: tenant, products });
  } catch (error) {
    console.log("GET PUBLIC CATALOG ERROR:", error);
    return res.status(500).json({ message: "Error cargando catÃ¡logo" });
  }
};