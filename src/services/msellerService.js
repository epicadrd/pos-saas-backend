import axios from "axios";

const getHost = () => {
  const baseUrl = process.env.MSELLER_BASE_URL || "https://ecf.api.mseller.app";
  const env = process.env.MSELLER_ENV || "TesteCF";

  return `${baseUrl}/${env}`;
};

export const getMSellerEnvironment = () => {
  return process.env.MSELLER_ENV || "TesteCF";
};

export async function authenticateMSeller() {
  const response = await axios.post(`${getHost()}/customer/authentication`, {
    email: process.env.MSELLER_EMAIL,
    password: process.env.MSELLER_PASSWORD,
  });

  return response.data;
}

export async function sendECFToMSeller(payload) {
  const auth = await authenticateMSeller();

  const token = auth.idToken || auth.accessToken;

  const response = await axios.post(`${getHost()}/documentos-ecf`, payload, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-api-key": process.env.MSELLER_API_KEY,
    },
  });

  return response.data;
}

export async function getECFStatusFromMSeller(eNcf) {
  const auth = await authenticateMSeller();

  const token = auth.idToken || auth.accessToken;

  const response = await axios.get(`${getHost()}/documentos-ecf`, {
    params: {
      ecf: eNcf,
    },
    headers: {
      Authorization: `Bearer ${token}`,
      "x-api-key": process.env.MSELLER_API_KEY,
    },
  });

  return response.data;
}