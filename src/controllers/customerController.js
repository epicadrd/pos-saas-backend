import { Op } from "sequelize";
import { Customer } from "../models/index.js";
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
} from "../utils/sanitize.js";

export const getCustomers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const search = sanitizeString(req.query.search || "", 120);
    const status = sanitizeString(req.query.status || "active", 20);

    const where = { tenantId };

    if (status === "active") where.isActive = true;
    if (status === "inactive") where.isActive = false;

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { rnc: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const customers = await Customer.findAll({
      where,
      order: [["name", "ASC"]],
    });

    return res.json(customers);
  } catch (error) {
    console.log("GET CUSTOMERS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo clientes" });
  }
};

export const createCustomer = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const name = sanitizeString(req.body.name, 120);
    const rnc = sanitizeString(req.body.rnc, 30);
    const phone = sanitizePhone(req.body.phone);
    const email = sanitizeEmail(req.body.email);
    const address = sanitizeString(req.body.address, 255);

    if (!name) {
      return res.status(400).json({ message: "El nombre del cliente es obligatorio" });
    }

    if (rnc) {
      const exists = await Customer.findOne({
        where: { tenantId, rnc, isActive: true },
      });

      if (exists) {
        return res.status(400).json({ message: "Ya existe un cliente con este RNC/Cédula" });
      }
    }

    const customer = await Customer.create({
      tenantId,
      name,
      rnc: rnc || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
    });

    return res.status(201).json({
      message: "Cliente creado correctamente",
      customer,
    });
  } catch (error) {
    console.log("CREATE CUSTOMER ERROR:", error);
    return res.status(500).json({ message: "Error creando cliente" });
  }
};

export const updateCustomer = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const name = sanitizeString(req.body.name, 120);
    const rnc = sanitizeString(req.body.rnc, 30);
    const phone = sanitizePhone(req.body.phone);
    const email = sanitizeEmail(req.body.email);
    const address = sanitizeString(req.body.address, 255);

    const customer = await Customer.findOne({
      where: { id, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    if (!name) {
      return res.status(400).json({ message: "El nombre del cliente es obligatorio" });
    }

    if (rnc) {
      const exists = await Customer.findOne({
        where: {
          tenantId,
          rnc,
          isActive: true,
          id: { [Op.ne]: id },
        },
      });

      if (exists) {
        return res.status(400).json({ message: "Ya existe otro cliente con este RNC/Cédula" });
      }
    }

    await customer.update({
      name,
      rnc: rnc || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
    });

    return res.json({
      message: "Cliente actualizado correctamente",
      customer,
    });
  } catch (error) {
    console.log("UPDATE CUSTOMER ERROR:", error);
    return res.status(500).json({ message: "Error actualizando cliente" });
  }
};

export const deleteCustomer = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const customer = await Customer.findOne({
      where: { id, tenantId },
    });

    if (!customer) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }

    await customer.update({ isActive: false });

    return res.json({ message: "Cliente desactivado correctamente" });
  } catch (error) {
    console.log("DELETE CUSTOMER ERROR:", error);
    return res.status(500).json({ message: "Error desactivando cliente" });
  }
};