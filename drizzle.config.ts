import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export default defineConfig({
  out: "./migrations",
  // Pointe vers le re-export central (shared/schema.ts) plutôt que le
  // dossier `./shared/schema/` qui n'inclut PAS récursivement les
  // sous-dossiers (les tables `cashmy_*` dans `shared/schema/cashmy/`
  // étaient ignorées en 2026-05-20, donc db:push pensait n'avoir
  // rien à pousser malgré le merge PR #99).
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
