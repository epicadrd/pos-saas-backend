import { DataTypes } from "sequelize";

/*
 * Agrega la base del ITBIS (100 o 10) a cotizaciones y facturas, y el
 * descuento en monto a las cotizaciones. sequelize.sync() no altera tablas
 * existentes, por eso se agregan aquí de forma idempotente.
 */
const TAX_BASE_COLUMN = {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 100,
};

const TABLE_COLUMNS = {
  Quotes: {
    taxBasePercent: TAX_BASE_COLUMN,
    discountAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  },
  Invoices: { taxBasePercent: TAX_BASE_COLUMN },
};

export const ensureTaxBaseColumns = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();

  // MySQL en Windows devuelve los nombres en minúsculas
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  for (const [tableName, columns] of Object.entries(TABLE_COLUMNS)) {
    if (!existingTables.includes(tableName.toLowerCase())) continue;

    const table = await queryInterface.describeTable(tableName);

    for (const [column, definition] of Object.entries(columns)) {
      if (!table[column]) {
        await queryInterface.addColumn(tableName, column, definition);
      }
    }
  }
};
