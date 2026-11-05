import axios from "axios";
import ExcelJS from "exceljs";
import { logger } from "../utils/secureLogger.js";

/*
 * Tasa del dólar para las facturas en US$.
 *
 * Fuente principal: la tasa de referencia oficial del Banco Central (BCRD),
 * que publica un Excel con la compra y venta de cada día hábil. Se usa la
 * tasa de compra. Si el BCRD no responde se usa open.er-api.com (gratis, sin
 * clave, no oficial). El resultado queda en memoria unas horas.
 */

const BCRD_URL =
  "https://cdn.bancentral.gov.do/documents/estadisticas/mercado-cambiario/documents/TASA_DOLAR_REFERENCIA_MC.xlsx";
const FALLBACK_URL = "https://open.er-api.com/v6/latest/USD";

const CACHE_MS = 3 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 15000;

const MONTHS = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, oct: 10, nov: 11, dic: 12,
};

let cached = null;
let pending = null;

const cellValue = (cell) => {
  const value = cell?.value;
  return value && typeof value === "object" && "result" in value ? value.result : value;
};

const toRate = (value) => {
  const rate = Number(value);
  // Rango de cordura: evita guardar una celda mal leída como tasa
  return Number.isFinite(rate) && rate > 10 && rate < 1000 ? Math.round(rate * 10000) / 10000 : null;
};

const pad = (n) => String(n).padStart(2, "0");

const fetchFromBCRD = async () => {
  const { data } = await axios.get(BCRD_URL, {
    responseType: "arraybuffer",
    timeout: TIMEOUT_MS,
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet = workbook.getWorksheet("Diaria") || workbook.worksheets[0];

  if (!sheet) throw new Error("El Excel del BCRD no tiene hojas");

  // Columnas A-E: Año | Mes | Día | Compra | Venta (los títulos ocupan las filas 1-3)
  for (let rowNumber = sheet.rowCount; rowNumber > 3; rowNumber -= 1) {
    const row = sheet.getRow(rowNumber);
    const year = Number(cellValue(row.getCell(1)));
    const month = MONTHS[String(cellValue(row.getCell(2)) || "").trim().slice(0, 3).toLowerCase()];
    const day = Number(cellValue(row.getCell(3)));
    const buy = toRate(cellValue(row.getCell(4)));
    const sell = toRate(cellValue(row.getCell(5)));

    if (year > 2000 && month && day && buy) {
      return {
        rate: buy,
        buy,
        sell,
        date: `${year}-${pad(month)}-${pad(day)}`,
        source: "BCRD",
      };
    }
  }

  throw new Error("No se encontró la tasa en el Excel del BCRD");
};

const fetchFromFallback = async () => {
  const { data } = await axios.get(FALLBACK_URL, { timeout: TIMEOUT_MS });
  const rate = toRate(data?.rates?.DOP);

  if (data?.result !== "success" || !rate) {
    throw new Error("La fuente alterna no devolvió la tasa del peso");
  }

  return {
    rate,
    buy: null,
    sell: null,
    date: new Date((data.time_last_update_unix || 0) * 1000).toISOString().slice(0, 10),
    source: "mercado",
  };
};

const loadRate = async () => {
  try {
    return await fetchFromBCRD();
  } catch (error) {
    logger.warn("BCRD_RATE_FAILED", { message: error.message });
  }

  return fetchFromFallback();
};

export const getUsdExchangeRate = async () => {
  const now = Date.now();

  if (cached && now < cached.expiresAt) return cached.value;

  pending ||= loadRate()
    .then((value) => {
      cached = { value, expiresAt: Date.now() + CACHE_MS };
      return value;
    })
    .catch((error) => {
      // Si ambas fuentes fallan, se sigue usando la última tasa conocida
      if (cached) {
        cached.expiresAt = Date.now() + FAILURE_RETRY_MS;
        return cached.value;
      }
      throw error;
    })
    .finally(() => {
      pending = null;
    });

  return pending;
};
