import { DataTypes } from "sequelize";

export const ensureTenantEntitlementColumns = async (
  sequelize
) => {
  const queryInterface =
    sequelize.getQueryInterface();

  const table =
    await queryInterface.describeTable(
      "Tenants"
    );

  if (!table.featureOverrides) {
    await queryInterface.addColumn(
      "Tenants",
      "featureOverrides",
      {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null,
      }
    );
  }

  if (!table.additionalUsers) {
    await queryInterface.addColumn(
      "Tenants",
      "additionalUsers",
      {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
      }
    );
  }
};