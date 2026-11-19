import { DataTypes } from "sequelize";

/*
 * Agrega la moneda y la tasa de cambio a facturas, notas y cotizaciones, y
 * el método de pago a las facturas. sequelize.sync() no altera tablas
 * existentes, por eso se agregan aquí de forma idempotente.
 */
const CURRENCY_COLUMNS = {
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

const TABLE_COLUMNS = {
  Invoices: {
    ...CURRENCY_COLUMNS,
    paymentMethod: { type: DataTypes.STRING(20), allowNull: true, defaultValue: null },
  },
  FiscalNotes: CURRENCY_COLUMNS,
  Quotes: CURRENCY_COLUMNS,
};

export const ensureInvoiceCurrencyColumns = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();

  // MySQL en Windows devuelve los nombres en minúsculas
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  for (const [tableName, columns] of Object.entries(TABLE_COLUMNS)) {
    // En una base nueva la tabla aún no existe; sync() la crea completa
    if (!existingTables.includes(tableName.toLowerCase())) continue;

    const table = await queryInterface.describeTable(tableName);

    for (const [column, definition] of Object.entries(columns)) {
      if (!table[column]) {
        await queryInterface.addColumn(tableName, column, definition);
      }
    }
  }
};
