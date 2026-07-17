import path from "path";
import {
  ElectronicInvoicingRequest,
  Tenant,
} from "../models/index.js";
import { encryptCertificateValue } from "../utils/certificateEncryption.js";
import { logSecurityEvent } from "../utils/securityLogger.js";
import { logger } from "../utils/secureLogger.js";

const MAX_CERTIFICATE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".p12", ".pfx"]);

const getPublicRequestData = (request) => {
  if (!request) {
    return {
      status: "not_requested",
      certificateUploaded: false,
    };
  }

  return {
    id: request.id,
    status: request.status,
    certificateUploaded: true,
    certificateFileName: request.certificateFileName,
    certificateSize: request.certificateSize,
    submittedAt: request.submittedAt,
    reviewedAt: request.reviewedAt,
    activatedAt: request.activatedAt,
    rejectionReason:
      request.status === "rejected"
        ? request.rejectionReason
        : null,
  };
};

export const getElectronicInvoicingRequest = async (req, res) => {
  try {
    const request = await ElectronicInvoicingRequest.findOne({
      where: {
        tenantId: req.user.tenantId,
      },
    });

    return res.json({
      request: getPublicRequestData(request),
    });
  } catch (error) {
    logger.error("GET_ECF_REQUEST_ERROR", error, {
      tenantId: req.user.tenantId,
    });

    return res.status(500).json({
      message: "No se pudo consultar la solicitud de emisión electrónica",
    });
  }
};

export const submitElectronicInvoicingRequest = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const certificate = req.file;
    const certificatePassword = String(
      req.body.certificatePassword || ""
    );
    const acceptedAuthorization =
      String(req.body.acceptedAuthorization) === "true";

    const tenant = await Tenant.findByPk(tenantId);

    if (!tenant) {
      return res.status(404).json({
        message: "Empresa no encontrada",
      });
    }

    if (tenant.country !== "DO") {
      return res.status(400).json({
        message:
          "La emisión electrónica e-CF solo está disponible para empresas de República Dominicana",
      });
    }

    if (!tenant.rnc?.trim()) {
      return res.status(400).json({
        message:
          "Debes registrar el RNC de la empresa antes de solicitar la emisión electrónica",
      });
    }

    if (!certificate) {
      return res.status(400).json({
        message: "Selecciona tu certificado digital .p12 o .pfx",
      });
    }

    const extension = path
      .extname(certificate.originalname || "")
      .toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return res.status(400).json({
        message:
          "El certificado debe tener extensión .p12 o .pfx",
      });
    }

    if (
      !certificate.buffer?.length ||
      certificate.size > MAX_CERTIFICATE_SIZE
    ) {
      return res.status(400).json({
        message:
          "El certificado está vacío o supera el límite de 5 MB",
      });
    }

    // Los certificados PKCS#12 normalmente están codificados en DER
    // y comienzan con una secuencia ASN.1: 0x30.
    if (certificate.buffer[0] !== 0x30) {
      return res.status(400).json({
        message:
          "El archivo seleccionado no parece ser un certificado PKCS#12 válido",
      });
    }

    if (!certificatePassword || certificatePassword.length > 255) {
      return res.status(400).json({
        message:
          "Introduce una contraseña válida para el certificado",
      });
    }

    if (!acceptedAuthorization) {
      return res.status(400).json({
        message:
          "Debes autorizar a ÉPICA SRL para gestionar la configuración electrónica",
      });
    }

    const encryptedCertificate = encryptCertificateValue(
      certificate.buffer
    );

    const encryptedPassword = encryptCertificateValue(
      certificatePassword
    );

    const existingRequest =
      await ElectronicInvoicingRequest.findOne({
        where: { tenantId },
      });

    if (
      existingRequest &&
      ["in_review", "configured", "active"].includes(
        existingRequest.status
      )
    ) {
      return res.status(409).json({
        message:
          existingRequest.status === "active"
            ? "La emisión electrónica de esta empresa ya está activa"
            : "Tu solicitud ya está siendo procesada",
      });
    }

    const values = {
      tenantId,
      certificateFileName: path
        .basename(certificate.originalname)
        .slice(0, 255),
      certificateMimeType:
        certificate.mimetype || "application/x-pkcs12",
      certificateSize: certificate.size,

      certificateEncrypted: encryptedCertificate.encrypted,
      certificateIv: encryptedCertificate.iv,
      certificateAuthTag: encryptedCertificate.authTag,

      passwordEncrypted: encryptedPassword.encrypted,
      passwordIv: encryptedPassword.iv,
      passwordAuthTag: encryptedPassword.authTag,

      status: "pending",
      rejectionReason: null,
      submittedBy: req.user.id,
      submittedAt: new Date(),
      reviewedAt: null,
      activatedAt: null,
    };

    const request = existingRequest
      ? await existingRequest.update(values)
      : await ElectronicInvoicingRequest.create(values);

    /*
      Muy importante:
      subir el certificado NO habilita la emisión automáticamente.
      ÉPICA debe configurarlo primero en la cuenta individual de MSeller.
    */
    if (tenant.electronicInvoicingEnabled) {
      await tenant.update({
        electronicInvoicingEnabled: false,
      });
    }

    await logSecurityEvent({
      req,
      user: req.user,
      event: existingRequest
        ? "ecf_certificate_replaced"
        : "ecf_certificate_submitted",
      level: "info",
      metadata: {
        tenantId,
        certificateFileName: values.certificateFileName,
        certificateSize: values.certificateSize,
      },
    });

    return res.status(existingRequest ? 200 : 201).json({
      message:
        "Certificado recibido correctamente. Revisaremos la solicitud y configuraremos la emisión electrónica.",
      request: getPublicRequestData(request),
    });
  } catch (error) {
    logger.error("SUBMIT_ECF_REQUEST_ERROR", error, {
      tenantId: req.user?.tenantId,
    });

    return res.status(500).json({
      message:
        "No se pudo recibir el certificado. Inténtalo nuevamente.",
    });
  }
};