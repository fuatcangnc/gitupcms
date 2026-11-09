# Gitupcms

Self-hosted comments for any website. Add one script tag to your pages and visitors can comment, reply, like
and mention each other after signing in with Google or GitHub. You moderate from your own admin panel, and the
comments stay in a SQLite file on your server.

- Threads per page, replies, likes, @mentions
- Moderation: pending / approved / spam, bans, a log of every action
- Email notifications (your SMTP server), unsubscribe links
- Light/dark theme, your color and corner radius
- Export everything as JSON, or delete it all

## Run it

Needs Node 22+ and pnpm.

```sh
cp .env.example .env    # set BETTER_AUTH_URL and BETTER_AUTH_SECRET at least
pnpm install
pnpm build
node --env-file=.env dist/server/entry.mjs   # HOST and PORT pick the address (default localhost:4321)
```

Or with Docker:

```sh
docker build -t gitupcms .
docker run -d -p 4321:4321 -v gitupcms-data:/data --env-file .env gitupcms
```

Put it behind HTTPS (Caddy, nginx…) at the address in `BETTER_AUTH_URL`.

Open the address. The first account you create (email and password, or GitHub when `GITHUB_CLIENT_ID` is
set) is the admin; after that sign-up is closed. Back up the database file (`DB_PATH`, default
`data/gitupcms.db`).

## Add comments to a site

1. **Add site**: give it a name and its domain. Comments are only accepted from that domain and the origins
   in Settings.
2. **Settings → Sign-in**: add a Google or GitHub OAuth app for commenters, or set the `COMMENTS_*` variables
   in `.env` for every site.
3. **Install**: paste the snippet into your pages:

   ```html
   <div data-wuppy-comments data-site-key="YOUR_KEY"></div>
   <script async src="https://comments.example.com/comments/embed.js"></script>
   ```

   Astro sites can use the component shown in the Install tab instead.

## Code

| Path | What |
| --- | --- |
| `src/plugins/comments/` | The comments: widget, its API, commenter sign-in, admin panel, emails |
| `src/pages/` | Admin sign-in, the sites list, a site's admin page and their API |
| `src/lib/admin.ts` | Admin sign-in (better-auth: email + password, GitHub) |
| `src/lib/db.ts` | The SQLite database |

`src/plugins/comments/` and a few UI files are shared with [WuppyCMS](../cms), which offers the same comments as a
plugin. Inside this repository, edit them in `../cms/src` and run `pnpm sync`; `pnpm check` fails when a copy is
out of date.

```sh
pnpm dev     # http://localhost:4321
pnpm check   # types + shared files in sync
pnpm test
```
