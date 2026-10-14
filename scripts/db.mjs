// Database helper: wraps the Supabase CLI using SUPABASE_DB_URL from .env.local.
//   npm run db:push   -> apply supabase/migrations to the remote database
//   npm run db:types  -> regenerate src/lib/types/database.types.ts
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const command = process.argv[2];
const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error(
    "SUPABASE_DB_URL is not set in .env.local.\n" +
      "Get it from Supabase Dashboard → Connect → Session pooler (replace [YOUR-PASSWORD]).",
  );
  process.exit(1);
}

function supabase(args, options = {}) {
  const result = spawnSync("npx", ["--yes", "supabase@2.121.0", ...args, "--db-url", dbUrl], {
    shell: process.platform === "win32",
    encoding: "utf8",
    stdio: options.capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return result.stdout;
}

if (command === "push") {
  supabase(["db", "push", "--include-all", "--yes"]);
} else if (command === "types") {
  const types = supabase(["gen", "types", "--lang", "typescript", "--schema", "public"], { capture: true });
  writeFileSync("src/lib/types/database.types.ts", types);
  console.log("Wrote src/lib/types/database.types.ts");
} else {
  console.error("Usage: node scripts/db.mjs <push|types>");
  process.exit(1);
}
