/*
 * Amplía los ENUM para los nuevos tipos de e-CF. sequelize.sync() no
 * altera tablas existentes, por eso se hace aquí de forma idempotente.
 */
const ENUM_CHANGES = [
  {
    table: "Invoices",
    column: "invoiceType",
    values: ["consumer_final", "credit_fiscal", "special_regime", "government"],
    definition: "NOT NULL DEFAULT 'consumer_final'",
  },
  {
    table: "FiscalNumberUsages",
    column: "documentType",
    values: ["invoice", "pos_sale", "fiscal_note"],
    definition: "NOT NULL",
  },
];

export const ensureEcfTypeColumns = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();

  // MySQL en Windows devuelve los nombres en minúsculas
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  for (const change of ENUM_CHANGES) {
    // En una base nueva la tabla aún no existe; sync() la crea completa
    if (!existingTables.includes(change.table.toLowerCase())) continue;

    const table = await queryInterface.describeTable(change.table);
    const currentType = String(table[change.column]?.type || "");

    if (change.values.every((value) => currentType.includes(`'${value}'`))) continue;

    const values = change.values.map((value) => `'${value}'`).join(",");

    await sequelize.query(
      `ALTER TABLE \`${change.table}\` MODIFY \`${change.column}\` ENUM(${values}) ${change.definition}`
    );
  }
};
