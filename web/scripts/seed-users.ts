/**
 * Seed plausible fans: real accounts with custodial wallets, exactly like
 * signup creates. Their keypairs are also written (plaintext, local-only,
 * gitignored) to cranker/_keys/bots.json so the bot runner can play them
 * during a replay — accuracy variance then emerges from real on-chain
 * settlements, not fabricated numbers.
 *
 * Run from web/: npx tsx scripts/seed-users.ts
 */
import { PrismaClient } from "@prisma/client";
import { Keypair } from "@solana/web3.js";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

const USERNAMES = [
  "corner_merchant", "xg_denier", "VARwatcher", "tikitakatiktok", "row_z_zidane",
  "offside_trap", "petenacci", "big_ron_swanson", "falsenine9", "midfield_gremlin",
  "onion_bag_dave", "gegenpresser", "wing_wizard_", "captain_armband", "nutmeg_nina",
  "clean_sheet_carl", "stoppage_timo", "top_bins_toni", "cynical_foul", "keeper_karen",
  "hat_trick_hana", "route_one_ron", "sweeper_keeper", "aggregate_andy",
];

function encryptSecret(secret: Uint8Array, keyB64: string): string {
  const key = Buffer.from(keyB64, "base64");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(secret)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), ct.toString("base64"), tag.toString("base64")].join(".");
}

async function main() {
  const prisma = new PrismaClient();
  const walletKey = process.env.WALLET_KEY!;
  if (!walletKey) throw new Error("WALLET_KEY missing (run with web/.env loaded)");

  const bots: { username: string; pubkey: string; secret: number[] }[] = [];
  const passwordHash = await bcrypt.hash("bigshout-bot", 10);

  for (const username of USERNAMES) {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.log(`= ${username} exists`);
      continue;
    }
    const wallet = Keypair.generate();
    await prisma.user.create({
      data: {
        username,
        passwordHash,
        walletPubkey: wallet.publicKey.toBase58(),
        walletSecretEnc: encryptSecret(wallet.secretKey, walletKey),
      },
    });
    bots.push({
      username,
      pubkey: wallet.publicKey.toBase58(),
      secret: Array.from(wallet.secretKey),
    });
    console.log(`+ ${username} -> ${wallet.publicKey.toBase58()}`);
  }

  const outPath = path.resolve(__dirname, "../../cranker/_keys/bots.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const prev = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : [];
  const merged = [...prev, ...bots.filter((b) => !prev.some((p: any) => p.username === b.username))];
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 1));
  console.log(`wrote ${merged.length} bot keypairs to cranker/_keys/bots.json`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
