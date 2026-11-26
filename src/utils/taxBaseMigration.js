import { DataTypes } from "sequelize";

/*
 * Agrega la base del ITBIS (100 o 10) a cotizaciones y facturas.
 * sequelize.sync() no altera tablas existentes, por eso se agrega aquí.
 */
const TAX_BASE_COLUMN = {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 100,
};

const TABLES = ["Quotes", "Invoices"];

export const ensureTaxBaseColumns = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();

  // MySQL en Windows devuelve los nombres en minúsculas
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  for (const tableName of TABLES) {
    if (!existingTables.includes(tableName.toLowerCase())) continue;

    const table = await queryInterface.describeTable(tableName);

    if (!table.taxBasePercent) {
      await queryInterface.addColumn(tableName, "taxBasePercent", TAX_BASE_COLUMN);
    }
  }
};
