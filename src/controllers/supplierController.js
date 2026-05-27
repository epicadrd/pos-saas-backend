import { Supplier } from "../models/index.js";
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
} from "../utils/sanitize.js";

export const getSuppliers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const suppliers = await Supplier.findAll({
      where: { tenantId },
      order: [["createdAt", "DESC"]],
    });

    res.json(suppliers);
  } catch (error) {
    console.log("GET SUPPLIERS ERROR:", error);
    res.status(500).json({ message: "Error obteniendo proveedores" });
  }
};

export const createSupplier = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const name = sanitizeString(req.body.name, 120);
    const rnc = sanitizeString(req.body.rnc, 30);
    const phone = sanitizePhone(req.body.phone);
    const email = sanitizeEmail(req.body.email);
    const address = sanitizeString(req.body.address, 255);
    const notes = sanitizeString(req.body.notes, 1000);

    if (!name) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    const supplier = await Supplier.create({
      tenantId,
      name,
      rnc: rnc || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
    });

    res.status(201).json(supplier);
  } catch (error) {
    console.log("CREATE SUPPLIER ERROR:", error);
    res.status(500).json({ message: "Error creando proveedor" });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const name = sanitizeString(req.body.name, 120);
    const rnc = sanitizeString(req.body.rnc, 30);
    const phone = sanitizePhone(req.body.phone);
    const email = sanitizeEmail(req.body.email);
    const address = sanitizeString(req.body.address, 255);
    const notes = sanitizeString(req.body.notes, 1000);

    const supplier = await Supplier.findOne({
      where: { id, tenantId },
    });

    if (!supplier) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }

    if (!name) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    await supplier.update({
      name,
      rnc: rnc || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      notes: notes || null,
    });

    res.json(supplier);
  } catch (error) {
    console.log("UPDATE SUPPLIER ERROR:", error);
    res.status(500).json({ message: "Error actualizando proveedor" });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const supplier = await Supplier.findOne({
      where: { id, tenantId },
    });

    if (!supplier) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }

    await supplier.destroy();

    res.json({ message: "Proveedor eliminado" });
  } catch (error) {
    console.log("DELETE SUPPLIER ERROR:", error);
    res.status(500).json({ message: "Error eliminando proveedor" });
  }
};

export const toggleSupplierStatus = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const supplier = await Supplier.findOne({
      where: { id, tenantId },
    });

    if (!supplier) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }

    await supplier.update({
      isActive: !supplier.isActive,
    });

    res.json(supplier);
  } catch (error) {
    console.log("TOGGLE SUPPLIER STATUS ERROR:", error);
    res.status(500).json({ message: "Error actualizando estado" });
  }
};