import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  const user =
    typeof username === "string"
      ? await prisma.user.findUnique({ where: { username } })
      : null;
  if (!user || !(await bcrypt.compare(password ?? "", user.passwordHash))) {
    return Response.json({ error: "Wrong username or password" }, { status: 401 });
  }

  const session = await getSession();
  session.userId = user.id;
  session.username = user.username;
  session.walletPubkey = user.walletPubkey;
  await session.save();

  return Response.json({ username: user.username });
}
