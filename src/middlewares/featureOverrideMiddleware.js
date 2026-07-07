const FEATURE_OVERRIDES = {
  13: ["inventory"],
};

export const tenantHasFeatureOverride = (tenantId, feature) => {
  const features = FEATURE_OVERRIDES[Number(tenantId)] || [];
  return features.includes(feature);
};