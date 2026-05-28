const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

export const validateLogoDataUrl = (value, maxBytes = 2 * 1024 * 1024) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  if (typeof value !== "string") {
    throw new Error("Logo inválido");
  }

  const match = value.match(/^data:(image\/png|image\/jpeg|image\/jpg|image\/webp);base64,([A-Za-z0-9+/=]+)$/);

  if (!match) {
    throw new Error("El logo debe ser PNG, JPG, JPEG o WEBP");
  }

  const mimeType = match[1];

  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    throw new Error("Tipo de logo no permitido");
  }

  const base64 = match[2];
  const sizeInBytes = Math.ceil((base64.length * 3) / 4);

  if (sizeInBytes > maxBytes) {
    throw new Error("El logo no puede pesar más de 2MB");
  }

  return value;
};