// Copies the comments code Gitupcms shares with WuppyCMS (../cms/src) into src/, unchanged.
// `node scripts/sync.mjs` copies, `node scripts/sync.mjs --check` fails if a copy is out of date.
// Edit shared files in ../cms, then sync. Gitupcms's own files (db, auth, pages…) are not touched.
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const from = join(root, "../cms/src");
const to = join(root, "src");

// Folders are copied whole, minus SKIP (the CMS's own admin page and API, which use GitHub).
const SHARED = [
  "plugins/comments",
  "lib/smtp.ts",
  "lib/email.ts",
  "lib/post.ts",
  "lib/utils.ts",
  "lib/select.ts",
  "components/ui/island.ts",
  "components/ui/button",
  "components/ui/card",
  "components/ui/tabs",
  "components/ui/select",
  "styles/globals.css",
];
const SKIP = new Set(["plugins/comments/pages/admin.astro", "plugins/comments/api/admin.ts", "plugins/comments/README.md"]);

if (!existsSync(from)) {
  console.log("No ../cms next to this folder: nothing to sync.");
  process.exit(0);
}

const files = (dir) =>
  statSync(dir).isDirectory() ? readdirSync(dir).flatMap((name) => files(join(dir, name))) : [dir];
const wanted = SHARED.flatMap((p) => files(join(from, p)))
  .map((f) => relative(from, f))
  .filter((f) => !SKIP.has(f));

if (process.argv.includes("--check")) {
  const stale = wanted.filter((f) => !existsSync(join(to, f)) || !readFileSync(join(from, f)).equals(readFileSync(join(to, f))));
  const extra = SHARED.filter((p) => statSync(join(from, p)).isDirectory())
    .flatMap((p) => (existsSync(join(to, p)) ? files(join(to, p)) : []))
    .map((f) => relative(to, f))
    .filter((f) => !wanted.includes(f));
  if (stale.length || extra.length) {
    console.error(`Out of sync with ../cms (run pnpm sync):\n${[...stale, ...extra].map((f) => `  ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${wanted.length} shared files match ../cms.`);
} else {
  for (const p of SHARED) rmSync(join(to, p), { recursive: true, force: true });
  for (const f of wanted) cpSync(join(from, f), join(to, f));
  console.log(`Copied ${wanted.length} shared files from ../cms.`);
}
