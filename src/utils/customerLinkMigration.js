import { DataTypes } from "sequelize";

const LINKED_TABLES = ["Invoices", "Quotes", "Receipts"];

/*
 * Agrega customerId a facturas, cotizaciones y recibos para
 * vincularlos al perfil del cliente. sequelize.sync() no altera
 * tablas existentes, por eso se agrega aquí de forma idempotente.
 * Los documentos anteriores quedan con customerId = NULL y el
 * perfil los asocia por RNC / nombre.
 */
export const ensureCustomerLinkColumns = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();
  // MySQL en Windows devuelve los nombres en minúsculas
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  for (const tableName of LINKED_TABLES) {
    // En una base nueva la tabla aún no existe; sync() la crea con la columna.
    if (!existingTables.includes(tableName.toLowerCase())) continue;

    const table = await queryInterface.describeTable(tableName);

    if (!table.customerId) {
      await queryInterface.addColumn(tableName, "customerId", {
        type: DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
      });

      await queryInterface.addIndex(tableName, ["tenantId", "customerId"], {
        name: `${tableName.toLowerCase()}_tenant_customer_idx`,
      });
    }
  }
};
