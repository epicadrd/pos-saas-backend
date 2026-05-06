import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Tenant, User } from "../models/index.js";

const isProduction = process.env.NODE_ENV === "production";

const createAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  );
};

const createRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};

const setRefreshCookie = (res, token) => {
  res.cookie("pos_refresh_token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

const cleanUser = (user) => {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
  };
};

export const register = async (req, res) => {
  try {
    const { businessName, rnc, phone, name, email, password } = req.body;

    if (!businessName || !name || !email || !password) {
      return res.status(400).json({
        message: "Completa todos los campos obligatorios",
      });
    }

    const userExists = await User.findOne({
      where: { email },
    });

    if (userExists) {
      return res.status(400).json({
        message: "Este correo ya está registrado",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const tenant = await Tenant.create({
      businessName,
      rnc,
      phone,
    });

    const user = await User.create({
      tenantId: tenant.id,
      name,
      email,
      password: hashedPassword,
      role: "master",
    });

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    setRefreshCookie(res, refreshToken);

    return res.status(201).json({
      message: "Cuenta creada correctamente",
      accessToken,
      user: cleanUser(user),
      tenant,
    });
  } catch (error) {
    console.log("REGISTER ERROR:", error);
    return res.status(500).json({
      message: "Error creando cuenta",
    });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Correo y contraseña son obligatorios",
      });
    }

    const user = await User.findOne({
      where: { email },
      include: [{ model: Tenant }],
    });

    if (!user) {
      return res.status(401).json({
        message: "Credenciales incorrectas",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "Este usuario está desactivado",
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        message: "Credenciales incorrectas",
      });
    }

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    setRefreshCookie(res, refreshToken);

    return res.json({
      message: "Login correcto",
      accessToken,
      user: cleanUser(user),
      tenant: user.Tenant,
    });
  } catch (error) {
    console.log("LOGIN ERROR:", error);
    return res.status(500).json({
      message: "Error iniciando sesión",
    });
  }
};

export const me = async (req, res) => {
  try {
    const token = req.cookies.pos_refresh_token;

    if (!token) {
      return res.status(401).json({
        message: "No autenticado",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const user = await User.findByPk(decoded.id, {
      include: [{ model: Tenant }],
    });

    if (!user) {
      return res.status(401).json({
        message: "Usuario no encontrado",
      });
    }

    if (!user.isActive) {
      res.clearCookie("pos_refresh_token");

      return res.status(403).json({
        message: "Este usuario está desactivado",
      });
    }

    const accessToken = createAccessToken(user);

    return res.json({
      accessToken,
      user: cleanUser(user),
      tenant: user.Tenant,
    });
  } catch (error) {
    return res.status(401).json({
      message: "Sesión inválida",
    });
  }
};

export const refresh = async (req, res) => {
  try {
    const token = req.cookies.pos_refresh_token;

    if (!token) {
      return res.status(401).json({
        message: "No autenticado",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

    const user = await User.findByPk(decoded.id);

    if (!user) {
      return res.status(401).json({
        message: "Usuario no encontrado",
      });
    }

    if (!user.isActive) {
      res.clearCookie("pos_refresh_token");

      return res.status(403).json({
        message: "Este usuario está desactivado",
      });
    }

    const accessToken = createAccessToken(user);

    return res.json({
      accessToken,
      user: cleanUser(user),
    });
  } catch (error) {
    return res.status(401).json({
      message: "Token inválido",
    });
  }
};

export const logout = async (req, res) => {
  res.clearCookie("pos_refresh_token", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  });

  return res.json({
    message: "Sesión cerrada correctamente",
  });
};

export const updateTenant = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const {
      businessName,
      email,
      address,
      rnc,
      phone,
      logoDataUrl,
      primaryColor,
      invoiceTaxEnabled,
      invoiceTaxMode,
      invoiceTaxRate,
      invoicePrefix,
      invoiceNextNumber,
      invoiceDigits,
    } = req.body;

    if (!businessName?.trim()) {
      return res.status(400).json({
        message: "El nombre de la empresa es obligatorio",
      });
    }

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    await tenant.update({
      businessName: businessName.trim(),
      email: email?.trim() || null,
      address: address?.trim() || null,
      rnc: rnc?.trim() || null,
      phone: phone?.trim() || null,
      logoDataUrl: logoDataUrl || tenant.logoDataUrl,
      primaryColor: primaryColor || tenant.primaryColor || "#6d4aff",
      invoiceTaxEnabled: typeof invoiceTaxEnabled === "boolean" ? invoiceTaxEnabled: tenant.invoiceTaxEnabled,
      invoiceTaxMode:  invoiceTaxMode === "line" || invoiceTaxMode === "global" ? invoiceTaxMode : tenant.invoiceTaxMode,
      invoiceTaxRate: invoiceTaxRate !== undefined && Number(invoiceTaxRate) >= 0 ? Number(invoiceTaxRate) : tenant.invoiceTaxRate,
      invoicePrefix: invoicePrefix?.trim() || tenant.invoicePrefix || "FAC",
      invoiceNextNumber: invoiceNextNumber !== undefined && Number(invoiceNextNumber) > 0 ? Number(invoiceNextNumber) : tenant.invoiceNextNumber,
      invoiceDigits:invoiceDigits !== undefined && Number(invoiceDigits) >= 3 ? Number(invoiceDigits) : tenant.invoiceDigits,
    });

    return res.json({
      message: "Empresa actualizada correctamente",
      tenant,
    });
  } catch (error) {
    console.log("UPDATE TENANT ERROR:", error);
    return res.status(500).json({
      message: "Error actualizando empresa",
    });
  }
};