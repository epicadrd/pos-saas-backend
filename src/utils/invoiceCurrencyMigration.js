import { DataTypes } from "sequelize";

/*
 * Agrega la moneda y la tasa de cambio a facturas y notas. sequelize.sync()
 * no altera tablas existentes, por eso se agregan aquí de forma idempotente.
 */
const COLUMNS = {
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: "DOP",
  },
  exchangeRate: {
    type: DataTypes.DECIMAL(12, 4),
    allowNull: true,
    defaultValue: null,
  },
};

export const ensureInvoiceCurrencyColumns = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();

  // MySQL en Windows devuelve los nombres en minúsculas
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  for (const tableName of ["Invoices", "FiscalNotes"]) {
    // En una base nueva la tabla aún no existe; sync() la crea completa
    if (!existingTables.includes(tableName.toLowerCase())) continue;

    const table = await queryInterface.describeTable(tableName);

    for (const [column, definition] of Object.entries(COLUMNS)) {
      if (!table[column]) {
        await queryInterface.addColumn(tableName, column, definition);
      }
    }
  }
};
