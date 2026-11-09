/**
 * Sign-in for the Gitupcms admin: email + password, and GitHub when GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set.
 * The first account created becomes the admin; after that sign-up is closed, and GitHub only signs in the admin
 * (linked by the same, GitHub-verified email). Commenters use their own tables and cookie (plugins/comments/lib/auth.ts).
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { db } from "./db";

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];
const github = env("GITHUB_CLIENT_ID") && env("GITHUB_CLIENT_SECRET") ? { clientId: env("GITHUB_CLIENT_ID")!, clientSecret: env("GITHUB_CLIENT_SECRET")! } : undefined;

export const hasAdmin = () => !!db.prepare('SELECT 1 FROM "user" LIMIT 1').get();
export const githubEnabled = !!github;

/** This app's public address (BETTER_AUTH_URL), e.g. https://comments.example.com. */
export const appOrigin = new URL(env("BETTER_AUTH_URL") || "http://localhost:4321").origin;

const options = {
  baseURL: appOrigin,
  secret: env("BETTER_AUTH_SECRET"),
  database: db,
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  socialProviders: github ? { github } : {},
  advanced: { cookiePrefix: "gitupcms" },
  onAPIError: { errorURL: "/login" },
  // shortcut: one admin per server; add invites when a team needs several.
  databaseHooks: { user: { create: { before: async () => (hasAdmin() ? false : undefined) } } },
} satisfies BetterAuthOptions;

await (await getMigrations(options)).runMigrations();

export const adminAuth = betterAuth(options);

/** The signed-in admin, else null. */
export const adminOf = async (headers: Headers) => (await adminAuth.api.getSession({ headers }).catch(() => null))?.user ?? null;
