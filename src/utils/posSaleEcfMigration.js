import { DataTypes } from "sequelize";

/*
 * Agrega signedDate a PosSales. sequelize.sync() no altera tablas
 * existentes, por eso se agrega aquí de forma idempotente.
 */
export const ensurePosSaleEcfColumns = async (sequelize) => {
  const queryInterface = sequelize.getQueryInterface();

  // MySQL en Windows devuelve los nombres en minúsculas
  const existingTables = (await queryInterface.showAllTables()).map((table) =>
    String(typeof table === "string" ? table : table.tableName).toLowerCase()
  );

  // En una base nueva la tabla aún no existe; sync() la crea con la columna.
  if (!existingTables.includes("possales")) return;

  const table = await queryInterface.describeTable("PosSales");

  if (!table.signedDate) {
    await queryInterface.addColumn("PosSales", "signedDate", {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: null,
    });
  }
};
