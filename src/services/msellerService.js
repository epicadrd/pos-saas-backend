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
    // Cambia cuando el panel de administración actualiza la credencial
    version: `${credential.id}:${new Date(credential.updatedAt).getTime()}`,
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

/*
 * El token de MSeller dura 60 minutos y cada autenticación consume
 * cuota. Se reutiliza por empresa durante 50 minutos y se descarta si
 * la credencial cambia o MSeller responde 401.
 */
const TOKEN_TTL_MS = 50 * 60 * 1000;
const tokenCache = new Map();
const pendingAuth = new Map();

const getAuthorizedSession = async (tenantId, { forceRefresh = false } = {}) => {
  const configuration = await getTenantMSellerConfiguration(tenantId);
  const cached = tokenCache.get(tenantId);

  if (
    !forceRefresh &&
    cached &&
    cached.version === configuration.version &&
    cached.expiresAt > Date.now()
  ) {
    return { token: cached.token, configuration };
  }

  // Ventas simultáneas comparten una sola autenticación
  const pendingKey = `${tenantId}:${configuration.version}`;

  if (!pendingAuth.has(pendingKey)) {
    pendingAuth.set(
      pendingKey,
      authenticateMSeller(tenantId)
        .then(({ authentication }) => {
          const token = authentication.idToken || authentication.accessToken;

          if (!token) {
            throw new Error("MSeller no devolvió un token de autenticación válido");
          }

          tokenCache.set(tenantId, {
            token,
            version: configuration.version,
            expiresAt: Date.now() + TOKEN_TTL_MS,
          });

          return token;
        })
        .finally(() => pendingAuth.delete(pendingKey))
    );
  }

  return { token: await pendingAuth.get(pendingKey), configuration };
};

const withMSellerSession = async (tenantId, request) => {
  const session = await getAuthorizedSession(tenantId);

  try {
    return await request(session);
  } catch (error) {
    // Un 401 no procesa el documento: se renueva el token y se repite una vez
    if (error?.response?.status !== 401) throw error;

    tokenCache.delete(tenantId);
    return request(await getAuthorizedSession(tenantId, { forceRefresh: true }));
  }
};

export async function sendECFToMSeller(
  tenantId,
  payload,
  { timeout = 60000 } = {}
) {
  return withMSellerSession(tenantId, async ({ token, configuration }) => {
    const response = await axios.post(
      `${configuration.host}/documentos-ecf`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-api-key": configuration.apiKey,
        },
        timeout,
      }
    );

    return response.data;
  });
}

export async function getECFStatusFromMSeller(
  tenantId,
  eNcf
) {
  return withMSellerSession(tenantId, async ({ token, configuration }) => {
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
  });
}

export async function getMSellerEnvironment(
  tenantId
) {
  const configuration =
    await getTenantMSellerConfiguration(tenantId);

  return configuration.environment;
}