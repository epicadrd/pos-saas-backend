import axios from "axios";
import { TenantMSellerCredential } from "../models/index.js";
import { decryptCertificateValue } from "../utils/certificateEncryption.js";

const getBaseUrl = () => {
  return (
    process.env.MSELLER_BASE_URL ||
    "https://ecf.api.mseller.app"
  ).replace(/\/+$/, "");
};

const decryptText = ({
  encrypted,
  iv,
  authTag,
}) => {
  return decryptCertificateValue({
    encrypted,
    iv,
    authTag,
  }).toString("utf8");
};

const getTenantMSellerConfiguration = async (
  tenantId
) => {
  if (!tenantId) {
    throw new Error(
      "No se recibió la empresa para emitir el e-CF"
    );
  }

  const credential =
    await TenantMSellerCredential.findOne({
      where: {
        tenantId,
        isActive: true,
      },
    });

  if (!credential) {
    throw new Error(
      "Esta empresa no tiene credenciales activas de MSeller configuradas"
    );
  }

  const environment = String(
    credential.environment || "TesteCF"
  ).trim();

  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(environment)) {
    throw new Error(
      "El entorno de MSeller configurado no es válido"
    );
  }

  const password = decryptText({
    encrypted: credential.passwordEncrypted,
    iv: credential.passwordIv,
    authTag: credential.passwordAuthTag,
  });

  const apiKey = decryptText({
    encrypted: credential.apiKeyEncrypted,
    iv: credential.apiKeyIv,
    authTag: credential.apiKeyAuthTag,
  });

  if (
    !credential.msellerEmail ||
    !password ||
    !apiKey
  ) {
    throw new Error(
      "La configuración de MSeller de esta empresa está incompleta"
    );
  }

  return {
    email: credential.msellerEmail,
    password,
    apiKey,
    environment,
    host: `${getBaseUrl()}/${environment}`,
  };
};

export async function authenticateMSeller(tenantId) {
  const configuration =
    await getTenantMSellerConfiguration(tenantId);

  const response = await axios.post(
    `${configuration.host}/customer/authentication`,
    {
      email: configuration.email,
      password: configuration.password,
    },
    {
      timeout: 30000,
    }
  );

  return {
    authentication: response.data,
    configuration,
  };
}

export async function sendECFToMSeller(
  tenantId,
  payload
) {
  const {
    authentication,
    configuration,
  } = await authenticateMSeller(tenantId);

  const token =
    authentication.idToken ||
    authentication.accessToken;

  if (!token) {
    throw new Error(
      "MSeller no devolvió un token de autenticación válido"
    );
  }

  const response = await axios.post(
    `${configuration.host}/documentos-ecf`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-api-key": configuration.apiKey,
      },
      timeout: 60000,
    }
  );

  return response.data;
}

export async function getECFStatusFromMSeller(
  tenantId,
  eNcf
) {
  const {
    authentication,
    configuration,
  } = await authenticateMSeller(tenantId);

  const token =
    authentication.idToken ||
    authentication.accessToken;

  if (!token) {
    throw new Error(
      "MSeller no devolvió un token de autenticación válido"
    );
  }

  const response = await axios.get(
    `${configuration.host}/documentos-ecf`,
    {
      params: {
        ecf: eNcf,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": configuration.apiKey,
      },
      timeout: 30000,
    }
  );

  return response.data;
}

export async function getMSellerEnvironment(
  tenantId
) {
  const configuration =
    await getTenantMSellerConfiguration(tenantId);

  return configuration.environment;
}