import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

const getEncryptionKey = () => {
  const key = process.env.ECF_CERTIFICATE_ENCRYPTION_KEY;

  if (!key || !/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error(
      "ECF_CERTIFICATE_ENCRYPTION_KEY debe contener exactamente 64 caracteres hexadecimales"
    );
  }

  return Buffer.from(key, "hex");
};

export const encryptCertificateValue = (value) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const input = Buffer.isBuffer(value)
    ? value
    : Buffer.from(String(value), "utf8");

  const encrypted = Buffer.concat([
    cipher.update(input),
    cipher.final(),
  ]);

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
};

export const decryptCertificateValue = ({
  encrypted,
  iv,
  authTag,
}) => {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(authTag, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]);
};