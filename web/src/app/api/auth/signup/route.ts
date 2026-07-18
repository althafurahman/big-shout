import { Keypair } from "@solana/web3.js";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { encryptSecret } from "@/lib/walletcrypto";

/**
 * Two fields, nothing else. A custodial wallet is created server-side and
 * never mentioned to the user — no seed phrase, no gas, no crypto anywhere
 * in the flow.
 */
export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== "string" || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return Response.json(
      { error: "Username: 3-20 letters, numbers or underscores" },
      { status: 400 }
    );
  }
  if (typeof password !== "string" || password.length < 6) {
    return Response.json({ error: "Password: at least 6 characters" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return Response.json({ error: "That username is taken" }, { status: 409 });
  }

  const wallet = Keypair.generate();
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 10),
      walletPubkey: wallet.publicKey.toBase58(),
      walletSecretEnc: encryptSecret(wallet.secretKey),
    },
  });

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.walletPubkey = user.walletPubkey;
  await session.save();

  return Response.json({ username: user.username });
}
