import { Chain } from "./chain";

/** One-time: register the service wallet as the program's market authority. */
async function main() {
  const chain = new Chain();
  const existing = await chain.connection.getAccountInfo(chain.configPda());
  if (existing) {
    console.log("config already initialized at", chain.configPda().toBase58());
    return;
  }
  const sig = await chain.initConfig();
  console.log("config initialized:", sig);
  console.log("admin:", chain.service.publicKey.toBase58());
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error("INIT FAILED:", e.message ?? e);
    process.exit(1);
  }
);
