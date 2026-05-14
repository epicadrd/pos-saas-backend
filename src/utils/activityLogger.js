import { ActivityLog } from "../models/index.js";

export const logActivity = async ({
  tenantId,
  userId = null,
  module,
  action,
  description,
  metadata = null,
  transaction = null,
}) => {
  try {
    await ActivityLog.create(
      {
        tenantId,
        userId,
        module,
        action,
        description,
        metadata,
      },
      transaction ? { transaction } : undefined
    );
  } catch (error) {
    console.log("ACTIVITY LOG ERROR:", error);
  }
};