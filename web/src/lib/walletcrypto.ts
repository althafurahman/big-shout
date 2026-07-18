import crypto from "crypto";

/**
 * Custodial wallet secrets at rest: AES-256-GCM under WALLET_KEY (32-byte
 * base64 env var). Users never see a wallet — no seed phrase, no gas, no
 * crypto vocabulary anywhere in the UI.
 */

function key(): Buffer {
  const k = Buffer.from(process.env.WALLET_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("WALLET_KEY must be 32 bytes base64");
  return k;
}

export function encryptSecret(secret: Uint8Array): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(secret)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), ct.toString("base64"), tag.toString("base64")].join(".");
}

export function decryptSecret(enc: string): Uint8Array {
  const [ivB, ctB, tagB] = enc.split(".");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return new Uint8Array(Buffer.concat([decipher.update(Buffer.from(ctB, "base64")), decipher.final()]));
}
