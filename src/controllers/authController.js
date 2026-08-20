import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  Tenant,
  User,
  ElectronicInvoicingRequest,
} from "../models/index.js";
import {
  clearLoginFailures,
  registerLoginFailure,
} from "../middlewares/authSecurityMiddleware.js";
import crypto from "crypto";
import { Op } from "sequelize";
import { sendBrevoEmail } from "../utils/brevoEmail.js";
import {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
} from "../utils/sanitize.js";
import { validateLogoDataUrl } from "../utils/fileValidators.js";
import { logSecurityEvent } from "../utils/securityLogger.js";
import { logger } from "../utils/secureLogger.js";

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
    { expiresIn: "8h" }
  );
};

const refreshCookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
  maxAge: 8 * 60 * 60 * 1000,
};

const setRefreshCookie = (res, token) => {
  res.cookie("pos_refresh_token", token, refreshCookieOptions);
};

const clearRefreshCookie = (res) => {
  res.clearCookie("pos_refresh_token", refreshCookieOptions);
};

const cleanUser = (user) => {
  return {
    id: user.id,
    tenantId: user.tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    preferredLanguage: user.preferredLanguage || "es",
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
    subject: "Confirma tu cuenta en Aventra",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;">
        <h2>Confirma tu cuenta</h2>
        <p>Hola ${user.name}, gracias por registrarte en Aventra.</p>
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
    const isTrialRegistration = req.trialRegistration === true;
    const trialPlan = sanitizeString(req.body.plan, 30);
    const trialBillingPeriod = sanitizeString(
      req.body.billingPeriod,
      20
    );
    const businessName = sanitizeString(req.body.businessName, 150);
    const rnc = sanitizeString(req.body.rnc, 30);
    const phone = sanitizePhone(req.body.phone);
    const name = sanitizeString(req.body.name, 120);
    const password = req.body.password;
    const email = sanitizeEmail(req.body.email);

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

    if (
      isTrialRegistration &&
      !["emprendedor", "pyme", "empresarial"].includes(trialPlan)
    ) {
      return res.status(400).json({
        message: "El plan seleccionado no es válido",
      });
    }

    if (
      isTrialRegistration &&
      !["monthly", "annual"].includes(trialBillingPeriod)
    ) {
      return res.status(400).json({
        message: "La modalidad seleccionada no es válida",
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
    const verification = generateEmailVerification();

    const tenant = await Tenant.create({
      businessName: businessName.trim(),
      rnc: rnc?.trim() || null,
      phone: phone?.trim() || null,
      trialEligible: isTrialRegistration,
      trialUsed: false,
      plan: isTrialRegistration ? trialPlan : null,
      trialBillingPeriod: isTrialRegistration
        ? trialBillingPeriod
        : null,
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

    await logSecurityEvent({
      req,
      user,
      event: "user_registered",
      level: "info",
    });

    return res.status(201).json({
      message:
        "Cuenta creada correctamente. Revisa tu correo para confirmar tu cuenta antes de iniciar sesión.",
    });
  } catch (error) {
    logger.error("REGISTER_ERROR", error);
    return res.status(500).json({
      message: "Error creando cuenta",
    });
  }
};

export const login = async (req, res) => {
  try {
   const email = sanitizeEmail(req.body.email);
   const password = req.body.password;

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
    const remainingAttempts = await registerLoginFailure(req);

    await logSecurityEvent({
      req,
      event: "login_failed_user_not_found",
      level: "warning",
      email,
    });

    return res.status(401).json({
      message: "Credenciales incorrectas",
      remainingAttempts,
    });
  }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
    const remainingAttempts = await registerLoginFailure(req);

    await logSecurityEvent({
      req,
      user,
      event: "login_failed_invalid_password",
      level: "warning",
      email,
    });

    return res.status(401).json({
      message: "Credenciales incorrectas",
      remainingAttempts,
    });
  }

    if (!user.emailVerified) {
      await logSecurityEvent({
        req,
        user,
        event: "login_blocked_email_not_verified",
        level: "warning",
        email,
      });

      return res.status(403).json({
        code: "EMAIL_NOT_VERIFIED",
        message:
          "Debes confirmar tu cuenta antes de iniciar sesión. Revisa el enlace que enviamos a tu correo.",
      });
    }

    if (!user.isActive) {
      await logSecurityEvent({
        req,
        user,
        event: "login_blocked_user_inactive",
        level: "warning",
        email,
      });

      return res.status(403).json({
        message: "Este usuario está desactivado",
      });
    }

    await clearLoginFailures(req);

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    setRefreshCookie(res, refreshToken);

    await logSecurityEvent({
      req,
      user,
      event: "login_success",
      level: "info",
    });

    return res.json({
      message: "Login correcto",
      accessToken,
      user: cleanUser(user),
      tenant: user.Tenant,
    });
  } catch (error) {
    logger.error("LOGIN_ERROR", error);
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
      clearRefreshCookie(res);

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
    clearRefreshCookie(res);

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
      clearRefreshCookie(res);

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
  clearRefreshCookie(res);

  return res.status(401).json({
    message: "Token inválido",
  });
}
};

export const logout = async (req, res) => {
  await logSecurityEvent({
    req,
    user: req.user || null,
    event: "logout",
    level: "info",
  });

  clearRefreshCookie(res);

  return res.json({
    message: "Sesión cerrada correctamente",
  });
};

export const updateTenant = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const businessName = sanitizeString(req.body.businessName, 150);
    const email = sanitizeEmail(req.body.email);
    const address = sanitizeString(req.body.address, 255);
    const rnc = sanitizeString(req.body.rnc, 30);
    const phone = sanitizePhone(req.body.phone);
    const primaryColor = sanitizeString(req.body.primaryColor, 20);

    const invoicePrefix = sanitizeString(req.body.invoicePrefix, 20);

    const logoDataUrl = validateLogoDataUrl(req.body.logoDataUrl);
    const invoiceTaxEnabled = req.body.invoiceTaxEnabled;
    const invoiceTaxMode = req.body.invoiceTaxMode;
    const invoiceTaxRate = req.body.invoiceTaxRate;
    const country = req.body.country;
    const electronicInvoicingEnabled = req.body.electronicInvoicingEnabled;
    const usStateTaxRate = req.body.usStateTaxRate;
    const usCountyTaxRate = req.body.usCountyTaxRate;
    const usCityTaxRate = req.body.usCityTaxRate;
    const invoiceNextNumber = req.body.invoiceNextNumber;
    const invoiceDigits = req.body.invoiceDigits;
    const defaultInvoiceNotes = sanitizeString(req.body.defaultInvoiceNotes, 2000);

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

    let resolvedElectronicInvoicingEnabled =
  tenant.electronicInvoicingEnabled === true;

  if (typeof electronicInvoicingEnabled === "boolean") {
    if (electronicInvoicingEnabled === true) {
      const activeEcfRequest =
        await ElectronicInvoicingRequest.findOne({
          where: {
            tenantId,
            status: "active",
          },
          attributes: ["id", "status"],
        });

      if (!activeEcfRequest) {
        return res.status(403).json({
          message:
            "La facturación electrónica todavía no ha sido habilitada para esta empresa.",
        });
      }
    }

    resolvedElectronicInvoicingEnabled =
      electronicInvoicingEnabled;
  }
    const previousTenantData = {
    defaultInvoiceNotes: tenant.defaultInvoiceNotes,  
    businessName: tenant.businessName,
    email: tenant.email,
    address: tenant.address,
    rnc: tenant.rnc,
    phone: tenant.phone,
    primaryColor: tenant.primaryColor,
    invoicePrefix: tenant.invoicePrefix,
    invoiceTaxEnabled: tenant.invoiceTaxEnabled,
    invoiceTaxMode: tenant.invoiceTaxMode,
    invoiceTaxRate: tenant.invoiceTaxRate,
    invoiceNextNumber: tenant.invoiceNextNumber,
    invoiceDigits: tenant.invoiceDigits,
    country: tenant.country,
    electronicInvoicingEnabled: tenant.electronicInvoicingEnabled,
  };

    await tenant.update({

      businessName: businessName.trim(),
      email: email?.trim() || null,
      address: address?.trim() || null,
      rnc: rnc?.trim() || null,
      phone: phone?.trim() || null,
      logoDataUrl: logoDataUrl !== undefined ? logoDataUrl : tenant.logoDataUrl,
      primaryColor: primaryColor || tenant.primaryColor || "#6d4aff",
      invoiceTaxEnabled: typeof invoiceTaxEnabled === "boolean" ? invoiceTaxEnabled: tenant.invoiceTaxEnabled,
      invoiceTaxMode:  invoiceTaxMode === "line" || invoiceTaxMode === "global" ? invoiceTaxMode : tenant.invoiceTaxMode,
      invoiceTaxRate: invoiceTaxRate !== undefined && Number(invoiceTaxRate) >= 0 ? Number(invoiceTaxRate) : tenant.invoiceTaxRate,
      country: country === "US" || country === "DO" ? country : tenant.country,
      electronicInvoicingEnabled:
       resolvedElectronicInvoicingEnabled,
      usStateTaxRate:
        usStateTaxRate !== undefined && Number(usStateTaxRate) >= 0
          ? Number(usStateTaxRate)
          : tenant.usStateTaxRate,

      usCountyTaxRate:
        usCountyTaxRate !== undefined && Number(usCountyTaxRate) >= 0
          ? Number(usCountyTaxRate)
          : tenant.usCountyTaxRate,

      usCityTaxRate:
        usCityTaxRate !== undefined && Number(usCityTaxRate) >= 0
          ? Number(usCityTaxRate)
          : tenant.usCityTaxRate,
            invoicePrefix: invoicePrefix?.trim() || tenant.invoicePrefix || "FAC",
            invoiceNextNumber: invoiceNextNumber !== undefined && Number(invoiceNextNumber) > 0 ? Number(invoiceNextNumber) : tenant.invoiceNextNumber,
            invoiceDigits:invoiceDigits !== undefined && Number(invoiceDigits) >= 3 ? Number(invoiceDigits) : tenant.invoiceDigits,
            defaultInvoiceNotes:
            req.body.defaultInvoiceNotes !== undefined
              ? defaultInvoiceNotes?.trim() || null
              : tenant.defaultInvoiceNotes,
      });

    await logSecurityEvent({
      req,
      user: req.user,
      event: "tenant_updated",
      level: "info",
      metadata: {
        tenantId,
        previous: previousTenantData,
        current: {
          defaultInvoiceNotes: tenant.defaultInvoiceNotes,
          businessName: tenant.businessName,
          email: tenant.email,
          address: tenant.address,
          rnc: tenant.rnc,
          phone: tenant.phone,
          primaryColor: tenant.primaryColor,
          invoicePrefix: tenant.invoicePrefix,
          invoiceTaxEnabled: tenant.invoiceTaxEnabled,
          invoiceTaxMode: tenant.invoiceTaxMode,
          invoiceTaxRate: tenant.invoiceTaxRate,
          invoiceNextNumber: tenant.invoiceNextNumber,
          invoiceDigits: tenant.invoiceDigits,
          country: tenant.country,
          electronicInvoicingEnabled: tenant.electronicInvoicingEnabled,
        },
      },
    });

    return res.json({
      message: "Empresa actualizada correctamente",
      tenant,
    });
  } catch (error) {
    logger.error("UPDATE_TENANT_ERROR", error);
    return res.status(500).json({
      message: "Error actualizando empresa",
    });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const token = sanitizeString(req.params.token, 255);

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

    await logSecurityEvent({
      req,
      user,
      event: "email_verified",
      level: "info",
    });

    return res.json({
      message: "Correo confirmado correctamente. Ya puedes iniciar sesión.",
    });
  } catch (error) {
    logger.error("VERIFY_EMAIL_ERROR", error);
    return res.status(500).json({
      message: "Error confirmando correo",
    });
  }
};

export const resendVerificationEmail = async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);

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
    logger.error("RESEND_VERIFICATION_ERROR", error);
    return res.status(500).json({
      message: "Error reenviando confirmación",
    });
  }
}

const generatePasswordReset = () => {
  const token = crypto.randomBytes(32).toString("hex");

  return {
    token,
    expires: new Date(Date.now() + 1000 * 60 * 30), // 30 minutos
  };
};

const sendPasswordResetEmail = async (user) => {
  const resetUrl = `${process.env.APP_URL}/reset-password/${user.rawPasswordResetToken}`;

  await sendBrevoEmail({
    to: user.email,
    subject: "Restablece tu contraseña en Aventra",
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;">
        <h2>Restablecer contraseña</h2>
        <p>Hola ${user.name}, recibimos una solicitud para restablecer tu contraseña.</p>
        <p>Haz clic en el siguiente botón para crear una nueva contraseña.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#00b8a9;color:white;padding:14px 22px;border-radius:10px;text-decoration:none;font-weight:bold;">
          Restablecer contraseña
        </a>
        <p style="margin-top:24px;color:#555;">Este enlace vence en 30 minutos.</p>
        <p style="color:#555;">Si no solicitaste este cambio, puedes ignorar este correo.</p>
      </div>
    `,
  });
};

export const forgotPassword = async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({
        message: "El correo es obligatorio",
      });
    }

    const user = await User.findOne({ where: { email } });

   if (!user) {
    return res.status(404).json({
      message: "No encontramos una cuenta asociada a ese correo electrónico.",
    });
  }

 if (!user.isActive) {
  await logSecurityEvent({
    req,
    user,
    event: "password_reset_blocked_user_inactive",
    level: "warning",
    email,
  });

  return res.status(403).json({
    message: "Esta cuenta está desactivada. Contacta al administrador.",
  });
}

    const reset = generatePasswordReset();

    await user.update({
      passwordResetToken: reset.token,
      passwordResetExpires: reset.expires,
    });

    user.rawPasswordResetToken = reset.token;

    await sendPasswordResetEmail(user);

    await logSecurityEvent({
      req,
      user,
      event: "password_reset_requested",
      level: "info",
      email,
    });

  return res.json({
  message:
    "Hemos enviado un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada y la carpeta de spam.",
});
  } catch (error) {
    logger.error("FORGOT_PASSWORD_ERROR", error);

    return res.status(500).json({
      message: "Error solicitando restablecimiento de contraseña",
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const token = sanitizeString(req.params.token, 255);
    const password = req.body.password;

    if (!token) {
      return res.status(400).json({
        message: "Token inválido",
      });
    }

    if (!password || password.length < 8) {
      return res.status(400).json({
        message: "La contraseña debe tener al menos 8 caracteres",
      });
    }

    const user = await User.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          [Op.gt]: new Date(),
        },
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "El enlace no es válido o ya expiró.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "Este usuario está desactivado.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await user.update({
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    await logSecurityEvent({
      req,
      user,
      event: "password_reset_completed",
      level: "info",
      email: user.email,
    });

    return res.json({
      message: "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
    });
  } catch (error) {
    logger.error("RESET_PASSWORD_ERROR", error);

    return res.status(500).json({
      message: "Error restableciendo contraseña",
    });
  }
};

export const updateLanguage = async (req, res) => {
  try {
    const language = sanitizeString(req.body.language, 10);

    if (!["es", "en"].includes(language)) {
      return res.status(400).json({
        message: "Idioma no soportado",
      });
    }

    const user = await User.findOne({
      where: {
        id: req.user.id,
        tenantId: req.user.tenantId,
        isActive: true,
      },
      include: [{ model: Tenant }],
    });

    if (!user) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    await user.update({ preferredLanguage: language });

    return res.json({
      message: "Idioma actualizado correctamente",
      user: cleanUser(user),
      tenant: user.Tenant,
    });
  } catch (error) {
    logger.error("UPDATE_LANGUAGE_ERROR", error);

    return res.status(500).json({
      message: "Error actualizando idioma",
    });
  }
};