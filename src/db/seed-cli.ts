import { ensureSeedData } from "./seed";

async function main() {
  await ensureSeedData();
  console.log("Seed concluído com sucesso no PostgreSQL.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Erro ao executar seed:", err);
  process.exit(1);
});
