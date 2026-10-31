import { DataTypes } from "sequelize";

/*
 * Guarda la clave con la que se verifican los avisos de comprobantes
 * recibidos. sequelize.sync() no altera tablas existentes.
 */
const COLUMNS = ["webhookSecretEncrypted", "webhookSecretIv", "webhookSecretAuthTag"];

export const ensureWebhookSecretColumns = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();

  const tables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  if (!tables.includes("tenantmsellercredentials")) return;

  const existing = await queryInterface.describeTable("TenantMSellerCredentials");

  for (const column of COLUMNS) {
    if (existing[column]) continue;

    await queryInterface.addColumn("TenantMSellerCredentials", column, {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }
};
