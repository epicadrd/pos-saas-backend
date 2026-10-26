import { Op } from "sequelize";
import { FiscalNumberUsage } from "../models/index.js";
import { syncFiscalUsage } from "./ecfEmissionService.js";
import { logger } from "../utils/secureLogger.js";

const POLL_INTERVAL_MS = 2 * 60 * 1000;
const BATCH_SIZE = 40;
// Un envío sin confirmar se consulta después de este tiempo para no
// cruzarse con el reintento que pueda estar haciendo el usuario
const UNCERTAIN_GRACE_MS = 5 * 60 * 1000;
const MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;

let running = false;

/*
 * Busca e-NCF sin respuesta final de la DGII y consulta su estado.
 * Los más antiguos sin revisar van primero (updatedAt rota la cola).
 */
export const pollPendingECFStatuses = async () => {
  if (running) return;
  running = true;

  try {
    const now = Date.now();
    const usages = await FiscalNumberUsage.findAll({
      where: {
        reservedAt: { [Op.gte]: new Date(now - MAX_AGE_MS) },
        [Op.or]: [
          { status: "SENT" },
          {
            status: "RESERVED",
            attempts: { [Op.gt]: 0 },
            lastAttemptAt: { [Op.lt]: new Date(now - UNCERTAIN_GRACE_MS) },
          },
        ],
      },
      order: [["updatedAt", "ASC"]],
      limit: BATCH_SIZE,
    });

    let resolved = 0;

    for (const usage of usages) {
      const previousStatus = usage.status;

      try {
        await syncFiscalUsage(usage);
      } catch (error) {
        logger.warn("ECF_STATUS_POLL_ITEM_FAILED", {
          usageId: usage.id,
          tenantId: usage.tenantId,
          message: error?.message,
        });
      }

      if (usage.status !== previousStatus) resolved += 1;

      // Marca la revisión para que el siguiente lote tome otros números
      usage.changed("updatedAt", true);
      await usage.save({ fields: ["updatedAt"] }).catch(() => null);
    }

    if (usages.length) {
      logger.info("ECF_STATUS_POLL", { checked: usages.length, changed: resolved });
    }
  } catch (error) {
    logger.error("ECF_STATUS_POLL_FAILED", error);
  } finally {
    running = false;
  }
};

export const startECFStatusPoller = () => {
  if (process.env.ECF_STATUS_POLLING === "false") return;

  setTimeout(pollPendingECFStatuses, 30 * 1000);
  setInterval(pollPendingECFStatuses, POLL_INTERVAL_MS).unref();
};
