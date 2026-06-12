import dotenv from "dotenv";
dotenv.config();
import axios from "axios";

const BASE_URL = process.env.MSELLER_BASE_URL;
const ENV = process.env.MSELLER_ENV || "TesteCF";

const getHost = () => `${BASE_URL}/${ENV}`;

export async function authenticateMSeller() {
  const response = await axios.post(`${getHost()}/customer/authentication`, {
    email: process.env.MSELLER_EMAIL,
    password: process.env.MSELLER_PASSWORD,
  });

  return response.data;
}

export async function sendECF(payload) {
  const auth = await authenticateMSeller();

  const token = auth.idToken || auth.accessToken;

  const response = await axios.post(
    `${getHost()}/documentos-ecf`,
    payload,
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-api-key": process.env.MSELLER_API_KEY,
      },
    }
  );

  return response.data;
}

export async function getECFStatus(eNCF) {
  const auth = await authenticateMSeller();

  const token = auth.idToken || auth.accessToken;

  const response = await axios.get(
    `${getHost()}/documentos-ecf`,
    {
      params: {
        ecf: eNCF,
      },
      headers: {
        Authorization: `Bearer ${token}`,
        "x-api-key": process.env.MSELLER_API_KEY,
      },
    }
  );

  return response.data;
}

async function run() {
  try {
    const status = await getECFStatus("E310000391925");

    console.log("STATUS OK");
    console.log(JSON.stringify(status, null, 2));
  } catch (error) {
    console.error("ERROR:");
    console.error(error.response?.data || error.message);
  }
}

run();

run();