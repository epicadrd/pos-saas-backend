export const tenantHasFeatureOverride = (
  tenant,
  feature
) => {
  const rawFeatures =
    tenant?.featureOverrides;

  let features = rawFeatures;

  if (typeof rawFeatures === "string") {
    try {
      features = JSON.parse(
        rawFeatures
      );
    } catch {
      features = [];
    }
  }

  if (!Array.isArray(features)) {
    features = [];
  }

  return features.includes(feature);
};