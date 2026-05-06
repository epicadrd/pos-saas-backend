import { Supplier } from "../models/index.js";

export const getSuppliers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const suppliers = await Supplier.findAll({
      where: { tenantId },
      order: [["createdAt", "DESC"]],
    });

    res.json(suppliers);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error obteniendo proveedores" });
  }
};

export const createSupplier = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const { name, rnc, phone, email, address, notes } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: "El nombre es obligatorio" });
    }

    const supplier = await Supplier.create({
      tenantId,
      name: name.trim(),
      rnc,
      phone,
      email,
      address,
      notes,
    });

    res.status(201).json(supplier);
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Error creando proveedor" });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const supplier = await Supplier.findOne({
      where: { id, tenantId },
    });

    if (!supplier) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }

    await supplier.update(req.body);

    res.json(supplier);
  } catch (error) {
    console.log(error);
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

    await supplier.destroy(); // 🔥 eliminación real

    res.json({ message: "Proveedor eliminado" });
  } catch (error) {
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
    res.status(500).json({ message: "Error actualizando estado" });
  }
};

