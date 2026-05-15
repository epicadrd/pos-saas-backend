import bcrypt from "bcryptjs";
import { User } from "../models/index.js";

const cleanUser = (user) => ({
  id: user.id,
  tenantId: user.tenantId,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdBy: user.createdBy,
  createdAt: user.createdAt,
});

const allowedRoles = ["admin", "employee"];

export const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        tenantId: req.user.tenantId,
      },
      attributes: [
        "id",
        "tenantId",
        "name",
        "email",
        "role",
        "isActive",
        "createdBy",
        "createdAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json(users);
  } catch (error) {
    console.log("GET USERS ERROR:", error);
    return res.status(500).json({
      message: "Error cargando usuarios",
    });
  }
};

export const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password?.trim() || !role) {
      return res.status(400).json({
        message: "Nombre, correo, contraseña y rol son obligatorios",
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        message: "Rol inválido",
      });
    }

    const exists = await User.findOne({
      where: { email: email.trim().toLowerCase() },
    });

    if (exists) {
      return res.status(400).json({
        message: "Este correo ya está registrado",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

      const user = await User.create({
        tenantId: req.user.tenantId,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        role,
        isActive: true,
        createdBy: req.user.id,

        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      });

    return res.status(201).json({
      message: "Usuario creado correctamente",
      user: cleanUser(user),
    });
  } catch (error) {
    console.log("CREATE USER ERROR:", error);
    return res.status(500).json({
      message: "Error creando usuario",
    });
  }
};

export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, role, isActive, password } = req.body;

    const user = await User.findOne({
      where: {
        id,
        tenantId: req.user.tenantId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    if (user.role === "master") {
      return res.status(403).json({
        message: "No puedes modificar el usuario master desde aquí",
      });
    }

    const updateData = {};

    if (name?.trim()) updateData.name = name.trim();

    if (role) {
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          message: "Rol inválido",
        });
      }

      updateData.role = role;
    }

    if (typeof isActive === "boolean") {
      updateData.isActive = isActive;
    }

    if (password?.trim()) {
      updateData.password = await bcrypt.hash(password.trim(), 10);
    }

    await user.update(updateData);

    return res.json({
      message: "Usuario actualizado correctamente",
      user: cleanUser(user),
    });
  } catch (error) {
    console.log("UPDATE USER ERROR:", error);
    return res.status(500).json({
      message: "Error actualizando usuario",
    });
  }
};

export const deactivateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (Number(id) === Number(req.user.id)) {
      return res.status(400).json({
        message: "No puedes desactivarte a ti mismo",
      });
    }

    const user = await User.findOne({
      where: {
        id,
        tenantId: req.user.tenantId,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    if (user.role === "master") {
      return res.status(403).json({
        message: "No puedes desactivar el usuario master",
      });
    }

    await user.update({ isActive: false });

    return res.json({
      message: "Usuario desactivado correctamente",
    });
  } catch (error) {
    console.log("DEACTIVATE USER ERROR:", error);
    return res.status(500).json({
      message: "Error desactivando usuario",
    });
  }
};