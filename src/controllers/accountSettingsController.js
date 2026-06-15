import { Tenant } from "../models/index.js";

const clean = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const ensureMaster = (req, res) => {
  if (req.user.role !== "master") {
    res.status(403).json({
      message: "Solo el usuario master puede acceder a esta configuración",
    });

    return false;
  }

  return true;
};

export const getAccountSettings = async (req, res) => {
  try {
    if (!ensureMaster(req, res)) return;

    const tenant = await Tenant.findByPk(req.user.tenantId);

    if (!tenant) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    res.json(tenant);
  } catch (error) {
    console.log("GET ACCOUNT SETTINGS ERROR:", error);

    res.status(500).json({
      message: "Error cargando configuración de cuenta",
    });
  }
};

export const updateAccountSettings = async (req, res) => {
  try {
    if (!ensureMaster(req, res)) return;

    const tenant = await Tenant.findByPk(req.user.tenantId);

    if (!tenant) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

   const allowedFields = [
    "businessName",
    "legalName",
    "rnc",
    "companyType",
    "address",
    "legalAddress",
    "email",
    "phone",
    "website",
    "industry",
    "clientEmail",
    "clientAddress",
    "country",
  ];

    const payload = {};

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        payload[field] = clean(req.body[field]);
      }
    });

    if (payload.businessName === null) {
      return res.status(400).json({
        message: "El nombre de la empresa es obligatorio",
      });
    }

    await tenant.update(payload);

    res.json({
      message: "Configuración actualizada correctamente",
      tenant,
    });
  } catch (error) {
    console.log("UPDATE ACCOUNT SETTINGS ERROR:", error);

    res.status(500).json({
      message: "Error actualizando configuración de cuenta",
    });
  }
};