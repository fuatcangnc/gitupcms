import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const path = process.env.DB_PATH || "data/gitupcms.db";
mkdirSync(dirname(path), { recursive: true });

/** One SQLite file holds everything: sites, comments, commenters and the admin account. */
export const db = new Database(path);
db.pragma("journal_mode = WAL");
