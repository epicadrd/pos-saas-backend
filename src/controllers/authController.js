import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Tenant, User } from "../models/index.js";
import {
  clearLoginFailures,
  registerLoginFailure,
} from "../middlewares/authSecurityMiddleware.js";
import crypto from "crypto";
import { Op } from "sequelize";
import { sendBrevoEmail } from "../utils/brevoEmail.js";

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

const generateEmailVerification = () => {
  const token = crypto.randomBytes(32).toString("hex");

  return {
    token,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24),
  };
};

const sendVerificationEmail = async (user) => {
  const verifyUrl = `${process.env.APP_URL}/verificar-correo/${user.rawVerificationToken}`;

  await sendBrevoEmail({
    to: user.email,
    subject: "Confirma tu cuenta en Corex",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;">
        <h2>Confirma tu cuenta</h2>
        <p>Hola ${user.name}, gracias por registrarte en Corex.</p>
        <p>Haz clic en el siguiente botón para confirmar tu correo y activar tu cuenta.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#2563eb;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold;">
          Confirmar cuenta
        </a>
        <p style="margin-top:24px;color:#555;">Este enlace vence en 24 horas.</p>
      </div>
    `,
  });
};

export const register = async (req, res) => {
  try {
    const { businessName, rnc, phone, name, password } = req.body;
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!businessName || !name || !email || !password) {
      return res.status(400).json({
        message: "Completa todos los campos obligatorios",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 8 caracteres",
      });
    }

    const userExists = await User.findOne({ where: { email } });

    if (userExists) {
      return res.status(400).json({
        message: "Este correo ya está registrado",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verification = generateEmailVerification();

    const tenant = await Tenant.create({
      businessName: businessName.trim(),
      rnc: rnc?.trim() || null,
      phone: phone?.trim() || null,
    });

    const user = await User.create({
      tenantId: tenant.id,
      name: name.trim(),
      email,
      password: hashedPassword,
      role: "master",
      emailVerified: false,
      emailVerificationToken: verification.token,
      emailVerificationExpires: verification.expires,
    });

    user.rawVerificationToken = verification.token;

    await sendVerificationEmail(user);

    return res.status(201).json({
      message:
        "Cuenta creada correctamente. Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.",
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
    const email = String(req.body.email || "").trim().toLowerCase();
    const { password } = req.body;

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
      const remainingAttempts = registerLoginFailure(req);

      return res.status(401).json({
        message: "Credenciales incorrectas",
        remainingAttempts,
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      const remainingAttempts = registerLoginFailure(req);

      return res.status(401).json({
        message: "Credenciales incorrectas",
        remainingAttempts,
      });
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message:
          "Debes confirmar tu cuenta antes de iniciar sesión. Revisa el enlace que enviamos a tu correo.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "Este usuario está desactivado",
      });
    }

    clearLoginFailures(req);

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

    const user = await User.findOne({
      where: {
        id: decoded.id,
        tenantId: decoded.tenantId,
      },
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

    const user = await User.findOne({
      where: {
        id: decoded.id,
        tenantId: decoded.tenantId,
        isActive: true,
      },
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

export const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await User.findOne({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: {
          [Op.gt]: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "El enlace de confirmación no es válido o ya expiró.",
      });
    }

    await user.update({
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    });

    return res.json({
      message: "Correo confirmado correctamente. Ya puedes iniciar sesión.",
    });
  } catch (error) {
    console.log("VERIFY EMAIL ERROR:", error);
    return res.status(500).json({
      message: "Error confirmando correo",
    });
  }
};

export const resendVerificationEmail = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "El correo es obligatorio",
      });
    }

    const user = await User.findOne({ where: { email } });

    if (!user) {
      return res.json({
        message: "Si el correo existe, enviaremos un nuevo enlace de confirmación.",
      });
    }

    if (user.emailVerified) {
      return res.status(400).json({
        message: "Este correo ya está confirmado.",
      });
    }

    const verification = generateEmailVerification();

    await user.update({
      emailVerificationToken: verification.token,
      emailVerificationExpires: verification.expires,
    });

    user.rawVerificationToken = verification.token;

    await sendVerificationEmail(user);

    return res.json({
      message: "Te enviamos un nuevo enlace de confirmación.",
    });
  } catch (error) {
    console.log("RESEND VERIFICATION ERROR:", error);
    return res.status(500).json({
      message: "Error reenviando confirmación",
    });
  }
};