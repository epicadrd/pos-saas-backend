import { DataTypes } from "sequelize";

/*
 * Agrega la columna emails (lista JSON de hasta 5 correos) a Customers.
 * La columna email se mantiene como el correo principal, que es el que
 * usan facturas, cotizaciones y conduces. sequelize.sync() no altera
 * tablas existentes, por eso se agrega aquí de forma idempotente.
 */
export const ensureCustomerEmailsColumn = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();
  // MySQL en Windows devuelve los nombres en minúsculas
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  // En una base nueva la tabla aún no existe; sync() la crea con la columna.
  if (!existingTables.includes("customers")) return;

  const table = await queryInterface.describeTable("Customers");

  if (!table.emails) {
    await queryInterface.addColumn("Customers", "emails", {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: null,
    });
  }
};
