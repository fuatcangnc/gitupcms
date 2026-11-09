/**
 * WuppyCMS comments embed: <div data-wuppy-comments data-site-key="…" data-slug="/post"></div> plus this script.
 * Renders in a shadow root, talks to /api/comments/<key>/… on the CMS that serves this file, and signs commenters
 * in through a popup that posts the session token back (see src/pages/comments/signed-in.astro).
 * All user text goes in with textContent; the only HTML strings are the icons below and the server's footer.
 */
import css from "./embed.css?inline";

type User = { id: string; name: string; username: string; image: string | null };
type Status = "PENDING" | "APPROVED" | "SPAM" | "DELETED";
type Comment = { id: string; body: string; status: Status; createdAt: string; editedAt: string | null; likeCount: number; hasLiked: boolean; parentId: string | null; commenter: User; banned?: boolean; replies: Comment[] };
type Theme = { theme: "AUTO" | "LIGHT" | "DARK"; primaryColor: string; radius: number };
type Provider = "google" | "github";
type Config = Theme & { currentUser?: User & { isBanned: boolean; notificationsEnabled: boolean }; poweredByHtml?: string; providers?: Provider[] };
// Brand marks for the sign-in buttons (Google's four colors; GitHub's in the text color).
const PROVIDER: Record<Provider, { label: string; logo: string }> = {
  google: {
    label: "Continue with Google",
    logo: '<svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>',
  },
  github: {
    label: "Continue with GitHub",
    logo: '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z"/></svg>',
  },
};
type Auth = { token: string; user: User };
type Kind = "main" | "reply" | "edit";

const script = document.currentScript as HTMLScriptElement | null;
const APP = script?.src ? new URL(script.src).origin : location.origin;
const AUTH_KEY = `wuppy-comments:auth:${APP}`;
const MAX = 2000;

// Tailwind registers its variables with @property, which does nothing inside a shadow root: give them their initial values.
const props = [...css.matchAll(/@property\s+(--[\w-]+)\s*\{[^}]*?initial-value:\s*([^;}]+)/g)].map((m) => `${m[1]}:${m[2].trim()}`).join(";");
const STYLE = `${css}\n@layer properties{:host,*,::before,::after,::backdrop{${props}}}`;

const ICONS = {
  heart: '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>',
  reply: '<path d="M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
  bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  bellOff: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M17 17H4a1 1 0 0 1-.74-1.673C4.59 13.956 6 12.499 6 8a6 6 0 0 1 .258-1.742"/><path d="m2 2 20 20"/><path d="M8.668 3.01A6 6 0 0 1 18 8c0 2.687.77 4.653 1.707 6.05"/>',
  pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
  trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  userX: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" x2="22" y1="8" y2="13"/><line x1="22" x2="17" y1="8" y2="13"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
};
const icon = (name: keyof typeof ICONS, filled = false) => {
  const span = document.createElement("span");
  span.className = "inline-flex";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  return span;
};

type Child = Node | string | null | undefined | false;
/** createElement with props: `class`, `on<event>`, element properties (value, disabled…), else attributes. */
const h = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, any> = {}, ...children: Child[]) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k in el) (el as any)[k] = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  el.append(...(children.filter((c) => c != null && c !== false) as (Node | string)[]));
  return el;
};

const BTN = "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";
const PRIMARY = `${BTN} h-9 px-3 bg-primary text-primary-foreground hover:bg-primary/90`;
const OUTLINE = `${BTN} h-9 px-3 border border-border bg-background hover:bg-muted dark:bg-input/30`;
const GHOST = `${BTN} h-7 px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground`;
const TEXTAREA = "block min-h-24 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const readableOn = (hex: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.6 ? "#0f172a" : "#ffffff";
};

const relativeTime = (iso: string, now = Date.now()) => {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 43200) return `${Math.floor(mins / 1440)}d ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso));
};

const store = {
  get: <T>(k: string): T | null => {
    try {
      return JSON.parse(localStorage.getItem(k) ?? "null");
    } catch {
      return null;
    }
  },
  set: (k: string, v: unknown) => {
    try {
      v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode */
    }
  },
};

const SAMPLE: Comment[] = [
  {
    id: "sample-1", body: "Great post! The part about @lena's setup was exactly what I needed.", status: "APPROVED", createdAt: new Date(Date.now() - 3 * 3600e3).toISOString(), editedAt: null, likeCount: 4, hasLiked: true, parentId: null,
    commenter: { id: "a", name: "Sam Rivera", username: "sam", image: null },
    replies: [{ id: "sample-2", body: "@sam glad it helped!", status: "APPROVED", createdAt: new Date(Date.now() - 2 * 3600e3).toISOString(), editedAt: null, likeCount: 1, hasLiked: false, parentId: "sample-1", commenter: { id: "b", name: "Lena Park", username: "lena", image: null }, replies: [] }],
  },
  { id: "sample-3", body: "", status: "DELETED", createdAt: new Date(Date.now() - 86400e3).toISOString(), editedAt: null, likeCount: 0, hasLiked: false, parentId: null, commenter: { id: "c", name: "", username: "", image: null }, replies: [] },
];

const widgets = new Set<Widget>();

class Widget {
  shadow: ShadowRoot;
  root = h("div", { class: "wc-root flex flex-col gap-4 text-sm" });
  theme: Theme | null;
  config: Config | null = null;
  comments: Comment[] = [];
  state: "loading" | "ready" | "error" = "loading";
  auth: Auth | null = store.get<Auth>(AUTH_KEY);
  signingIn = false;
  banned = false;
  notifications = true;
  reply: { id: string; parentId: string; name: string } | null = null;
  editing: string | null = null;
  menu: string | null = null;
  confirming: string | null = null;
  drafts: Record<Kind, string> = { main: "", reply: "", edit: "" };
  posting: Kind | null = null;
  liking = new Set<string>();
  error = "";
  errorTimer = 0;
  focus: Kind | null = null;
  usernames = new Map<string, User>();
  tooltip = h("div", { class: "pointer-events-none fixed z-50 hidden items-center gap-2 rounded-lg border bg-popover p-2 shadow-md" });
  observer: MutationObserver | null = null;
  lastDark: boolean | null = null;

  constructor(
    public el: HTMLElement,
    public key: string,
    public slug: string,
    public preview?: Theme,
  ) {
    this.shadow = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    this.shadow.replaceChildren(h("style", {}, STYLE), this.root, this.tooltip);
    this.theme = preview ?? store.get<Theme>(`wuppy-comments:theme:${key}`);
    this.applyTheme();
    this.observer = new MutationObserver(() => (this.el.isConnected || this.preview ? this.applyTheme() : this.destroy()));
    this.observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    this.root.addEventListener("mouseover", (e) => {
      const span = (e.target as Element).closest<HTMLElement>("[data-username]");
      if (span) this.showTooltip(span);
    });
    this.root.addEventListener("mouseout", (e) => {
      const span = (e.target as Element).closest("[data-username]");
      if (span && !span.contains(e.relatedTarget as Node)) this.tooltip.classList.replace("flex", "hidden");
    });
    widgets.add(this);
    if (preview) {
      this.comments = SAMPLE;
      this.config = { ...preview, providers: ["google"], poweredByHtml: 'Comments by <a class="z-footer-link" href="#">WuppyCMS</a>' };
      this.state = "ready";
      this.render();
    } else this.load();
  }

  destroy() {
    this.observer?.disconnect();
    widgets.delete(this);
  }

  // ─── Theme ───
  get dark() {
    const t = this.theme?.theme ?? "AUTO";
    return t === "DARK" || (t === "AUTO" && document.documentElement.classList.contains("dark"));
  }
  applyTheme() {
    const dark = this.dark;
    this.root.dataset.theme = dark ? "dark" : "light";
    const color = this.theme?.primaryColor ?? "#2563eb";
    this.root.style.setProperty("--primary", color);
    this.root.style.setProperty("--primary-foreground", readableOn(color));
    this.root.style.setProperty("--radius", `${this.theme?.radius ?? 8}px`);
    if (dark !== this.lastDark) {
      this.lastDark = dark;
      const cb = this.el.dataset.onThemeChange && (window as any)[this.el.dataset.onThemeChange];
      if (typeof cb === "function") cb(dark ? "dark" : "light");
    }
  }

  // ─── API ───
  async api(path: string, method = "GET", body?: unknown) {
    if (this.preview) throw new Error("This is a preview.");
    const headers: Record<string, string> = {};
    if (body) headers["Content-Type"] = "application/json";
    if (this.auth) headers.Authorization = `Bearer ${this.auth.token}`;
    const res = await fetch(`${APP}/api/comments/${encodeURIComponent(this.key)}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && this.auth) {
      this.setAuth(null);
      this.flash("Your session expired. Please sign in again.", 3000);
      throw new Error("");
    }
    if (!res.ok) throw new Error(json.error || "Something went wrong. Please try again.");
    return json;
  }

  async load() {
    try {
      const { comments, config } = (await this.api(`comments?slug=${encodeURIComponent(this.slug)}`)) as { comments: Comment[]; config: Config };
      this.config = config;
      this.theme = { theme: config.theme, primaryColor: config.primaryColor, radius: config.radius };
      store.set(`wuppy-comments:theme:${this.key}`, this.theme);
      this.applyTheme();
      // A token the server no longer knows: signed out, quietly.
      if (this.auth && !config.currentUser) this.setAuth(null, false);
      this.banned = config.currentUser?.isBanned ?? false;
      this.notifications = config.currentUser?.notificationsEnabled ?? true;
      this.comments = comments;
      this.state = "ready";
      this.render();
      this.scrollToHash();
    } catch {
      this.state = "error";
      this.render();
    }
  }

  /** Every widget on the page shares the sign-in; `reload` refetches their threads as the new viewer. */
  setAuth(auth: Auth | null, reload = true) {
    store.set(AUTH_KEY, auth);
    for (const w of widgets) {
      w.auth = auth;
      if (!auth) w.banned = false;
      if (reload && !w.preview) w.load();
    }
  }

  flash(message: string, ms = 4000) {
    if (!message) return;
    if (/suspended/i.test(message)) this.banned = true;
    this.error = message;
    clearTimeout(this.errorTimer);
    this.errorTimer = window.setTimeout(() => ((this.error = ""), this.render()), ms);
    this.render();
  }

  scrollToHash() {
    if (!location.hash.startsWith("#comment-")) return;
    const el = this.root.querySelector<HTMLElement>(`[data-id="${CSS.escape(location.hash.slice(9))}"]`);
    if (!el) return;
    setTimeout(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.cssText = "outline:2px solid var(--primary);outline-offset:4px;border-radius:var(--radius)";
      setTimeout(() => (el.style.cssText = ""), 2000);
    }, 100);
  }

  // ─── Actions ───
  signIn(provider?: Provider) {
    const popup = window.open(`${APP}/comments/sign-in?key=${encodeURIComponent(this.key)}&origin=${encodeURIComponent(location.origin)}${provider ? `&provider=${provider}` : ""}`, "wuppy-comments-sign-in", "width=500,height=600");
    if (!popup) return this.flash("Allow pop-ups for this site to sign in.");
    this.signingIn = true;
    this.render();
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== APP || e.data?.type !== "wuppy-comments-auth" || typeof e.data.token !== "string") return;
      window.removeEventListener("message", onMessage);
      this.signingIn = false;
      this.setAuth({ token: e.data.token, user: e.data.user });
    };
    window.addEventListener("message", onMessage);
    // The provider's pages may cut the popup off from us (COOP), so a "closed" popup only resets the button; the listener stays a while.
    const poll = setInterval(() => {
      if (!popup.closed) return;
      clearInterval(poll);
      if (this.signingIn) (this.signingIn = false), this.render();
    }, 500);
    setTimeout(() => window.removeEventListener("message", onMessage), 10 * 60_000);
  }

  providerButton(p: Provider) {
    const b = h("button", { type: "button", class: OUTLINE, disabled: !!this.preview, onclick: () => this.signIn(p) });
    b.innerHTML = PROVIDER[p].logo; // our own fixed markup
    b.append(PROVIDER[p].label);
    return b;
  }

  async signOut() {
    await this.api("sign-out", "POST", {}).catch(() => null);
    this.setAuth(null);
  }

  async toggleNotifications() {
    const next = !this.notifications;
    this.notifications = next;
    this.render();
    try {
      await this.api("me", "PATCH", { notificationsEnabled: next });
    } catch (e: any) {
      this.notifications = !next;
      this.flash(e.message);
    }
  }

  find(id: string) {
    for (const c of this.comments) {
      if (c.id === id) return c;
      const r = c.replies.find((r) => r.id === id);
      if (r) return r;
    }
  }

  async submit(kind: Kind) {
    const body = this.drafts[kind].trim();
    if (!body || body.length > MAX || this.posting) return;
    this.posting = kind;
    this.render();
    try {
      if (kind === "edit") {
        const updated: Comment = await this.api(`comments/${this.editing}`, "PATCH", { body });
        Object.assign(this.find(this.editing!)!, { body: updated.body, editedAt: updated.editedAt });
        this.editing = null;
      } else {
        const reply = kind === "reply" ? this.reply : null;
        const created: Comment = await this.api("comments", "POST", { body, slug: this.slug, url: location.href, parentId: reply?.parentId, replyToId: reply?.id });
        created.replies ??= [];
        if (reply) this.comments.find((c) => c.id === reply.parentId)?.replies.push(created);
        else this.comments.unshift(created);
        this.reply = null;
      }
      this.drafts[kind] = "";
    } catch (e: any) {
      this.flash(e.message);
    }
    this.posting = null;
    this.render();
  }

  async like(c: Comment) {
    if (!this.auth) return this.signIn(this.config?.providers?.length === 1 ? this.config.providers[0] : undefined);
    if (this.liking.has(c.id)) return;
    this.liking.add(c.id);
    this.render();
    try {
      const { liked, count } = await this.api(`comments/${c.id}/like`, "POST", {});
      c.hasLiked = liked;
      c.likeCount = count;
    } catch (e: any) {
      this.flash(e.message);
    }
    this.liking.delete(c.id);
    this.render();
  }

  async remove(c: Comment) {
    this.confirming = null;
    try {
      await this.api(`comments/${c.id}`, "PATCH", { status: "DELETED" });
      c.status = "DELETED";
      c.body = "";
    } catch (e: any) {
      this.flash(e.message);
    }
    this.render();
  }

  startReply(c: Comment, top: Comment) {
    this.reply = { id: c.id, parentId: top.id, name: c.commenter.name };
    // Replies stay two levels deep, so a reply to a reply names who it answers.
    this.drafts.reply = c.id !== top.id ? `@${c.commenter.username} ` : "";
    this.editing = null;
    this.focus = "reply";
    this.render();
  }

  // ─── Mentions ───
  mention: { box: HTMLElement; list: HTMLElement; items: User[]; index: number; start: number; area: HTMLTextAreaElement } | null = null;
  mentionTimer = 0;
  mentionSeq = 0;

  onType(area: HTMLTextAreaElement, kind: Kind, counter: HTMLElement, submit: HTMLButtonElement) {
    this.drafts[kind] = area.value;
    this.updateCounter(area.value, counter, submit);
    const before = area.value.slice(0, area.selectionStart);
    const m = /(^|\s)@([a-z0-9]{1,30})$/i.exec(before);
    clearTimeout(this.mentionTimer);
    if (!m) return this.hideMentions();
    const seq = ++this.mentionSeq;
    this.mentionTimer = window.setTimeout(async () => {
      const { commenters } = (await this.api(`commenters?q=${encodeURIComponent(m[2].toLowerCase())}`).catch(() => ({ commenters: [] }))) as { commenters: User[] };
      if (seq !== this.mentionSeq) return;
      for (const u of commenters) this.usernames.set(u.username, u);
      if (!commenters.length) return this.hideMentions();
      this.showMentions(area, commenters, before.length - m[2].length - 1);
    }, 180);
  }

  showMentions(area: HTMLTextAreaElement, items: User[], start: number) {
    this.hideMentions();
    const list = h("ul", { role: "listbox", "aria-label": "Mention someone", class: "flex flex-col p-1" });
    const box = h("div", { class: "absolute bottom-full left-0 z-40 mb-1 w-64 rounded-lg border bg-popover shadow-md" }, list);
    this.mention = { box, list, items, index: 0, start, area };
    this.drawMentions();
    area.parentElement!.append(box);
  }

  drawMentions() {
    const m = this.mention!;
    m.list.replaceChildren(
      ...m.items.map((u, i) =>
        h(
          "li",
          { role: "option", "aria-selected": String(i === m.index), class: `flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 ${i === m.index ? "bg-muted" : ""}`, onmousedown: (e: Event) => (e.preventDefault(), this.pickMention(u)) },
          this.avatar(u, true),
          h("span", { class: "truncate font-medium" }, u.name),
          h("span", { class: "truncate text-xs text-muted-foreground" }, `@${u.username}`),
        ),
      ),
    );
  }

  pickMention(u: User) {
    const { area, start } = this.mention!;
    const end = area.selectionStart;
    area.value = `${area.value.slice(0, start)}@${u.username} ${area.value.slice(end)}`;
    area.selectionStart = area.selectionEnd = start + u.username.length + 2;
    this.hideMentions();
    area.dispatchEvent(new Event("input"));
    area.focus();
  }

  hideMentions() {
    this.mentionSeq++;
    this.mention?.box.remove();
    this.mention = null;
  }

  onKey(e: KeyboardEvent, kind: Kind) {
    const m = this.mention;
    if (m) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        m.index = (m.index + (e.key === "ArrowDown" ? 1 : m.items.length - 1)) % m.items.length;
        return this.drawMentions();
      }
      if (e.key === "Enter" || e.key === "Tab") return e.preventDefault(), this.pickMention(m.items[m.index]);
      if (e.key === "Escape") return e.preventDefault(), this.hideMentions();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.preventDefault(), this.submit(kind));
    if (e.key === "Escape" && kind !== "main") ((kind === "edit" ? (this.editing = null) : (this.reply = null)), this.render());
  }

  showTooltip(span: HTMLElement) {
    const u = this.usernames.get(span.dataset.username!);
    if (!u) return;
    this.tooltip.replaceChildren(this.avatar(u), h("div", {}, h("p", { class: "text-sm font-medium" }, u.name), h("p", { class: "text-xs text-muted-foreground" }, `@${u.username}`)));
    const r = span.getBoundingClientRect();
    this.tooltip.style.left = `${r.left}px`;
    this.tooltip.style.bottom = `${window.innerHeight - r.top + 6}px`;
    this.tooltip.classList.replace("hidden", "flex");
  }

  // ─── Rendering ───
  updateCounter(value: string, counter: HTMLElement, submit: HTMLButtonElement) {
    const n = value.length;
    counter.textContent = `${n}/${MAX}`;
    counter.className = `text-xs tabular-nums ${n > MAX ? "text-destructive" : n >= MAX * 0.9 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`;
    submit.disabled = !value.trim() || n > MAX || !!this.posting;
  }

  avatar(u: User, small = false) {
    const size = small ? "size-6 text-[10px]" : "size-8 text-xs";
    return u.image
      ? h("img", { src: u.image, alt: "", referrerPolicy: "no-referrer", class: `${size} shrink-0 rounded-full object-cover` })
      : h("span", { "aria-hidden": "true", class: `${size} flex shrink-0 items-center justify-center rounded-full bg-muted font-medium uppercase` }, u.name.slice(0, 2));
  }

  form(kind: Kind, opts: { placeholder: string; submit: string; busy: string; label?: string; onCancel?: () => void }) {
    const counter = h("span", {});
    const submit = h("button", { type: "submit", class: PRIMARY }, this.posting === kind ? opts.busy : opts.submit);
    const area = h("textarea", {
      class: TEXTAREA,
      placeholder: opts.placeholder,
      value: this.drafts[kind],
      "aria-label": opts.label ?? opts.placeholder,
      "data-kind": kind,
      disabled: this.posting === kind,
      oninput: () => this.onType(area, kind, counter, submit),
      onkeydown: (e: KeyboardEvent) => this.onKey(e, kind),
      onblur: () => this.hideMentions(),
    });
    this.updateCounter(this.drafts[kind], counter, submit);
    return h(
      "form",
      { class: "flex flex-col gap-2", onsubmit: (e: Event) => (e.preventDefault(), this.submit(kind)) },
      opts.onCancel && opts.label && h("p", { class: "text-xs text-muted-foreground" }, opts.label),
      h("div", { class: "relative" }, area),
      h("div", { class: "flex items-center justify-between gap-2" }, counter, h("div", { class: "flex gap-2" }, opts.onCancel && h("button", { type: "button", class: OUTLINE, onclick: opts.onCancel }, "Cancel"), submit)),
    );
  }

  body(text: string) {
    const p = h("p", { class: "break-words whitespace-pre-wrap" });
    let last = 0;
    for (const m of text.matchAll(/@([a-z0-9]+)/g)) {
      p.append(text.slice(last, m.index), h("span", { class: "font-medium text-primary", "data-username": m[1] }, m[0]));
      last = m.index! + m[0].length;
    }
    p.append(text.slice(last));
    return p;
  }

  item(c: Comment, top: Comment): HTMLElement {
    const small = c !== top;
    const removed = c.status === "DELETED" || c.status === "SPAM";
    const mine = !!this.auth && c.commenter.id === this.auth.user.id;
    const canAct = !!this.auth && !this.banned && !this.preview;
    if (!removed) this.usernames.set(c.commenter.username, c.commenter);

    const head = removed
      ? h("div", { class: "flex items-center gap-1.5 text-muted-foreground" }, icon(c.status === "SPAM" ? "ban" : "userX"), h("span", { class: "italic" }, c.status === "SPAM" ? "Flagged as spam" : c.banned ? "Account is suspended" : "Comment Removed"))
      : h(
          "div",
          { class: "flex flex-wrap items-center gap-x-1.5 gap-y-0.5" },
          h("span", { class: "font-medium" }, c.commenter.name),
          h("span", { class: "text-xs text-muted-foreground" }, `@${c.commenter.username}`),
          h("time", { class: "text-xs text-muted-foreground", dateTime: c.createdAt, title: new Date(c.createdAt).toLocaleString() }, relativeTime(c.createdAt)),
          c.editedAt && h("span", { class: "text-xs text-muted-foreground" }, "· edited"),
          c.status === "PENDING" && h("span", { class: "inline-flex h-5 items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 text-xs font-medium text-amber-700 dark:text-amber-300", title: "Only you can see it until it's approved" }, "Pending"),
        );

    const liking = this.liking.has(c.id);
    const actions =
      !removed &&
      h(
        "div",
        { class: "-ml-2 flex items-center gap-0.5" },
        h(
          "button",
          { type: "button", class: `${GHOST} ${c.hasLiked ? "text-primary hover:text-primary" : ""}`, disabled: liking, "aria-pressed": String(c.hasLiked), "aria-label": c.hasLiked ? "Unlike" : "Like", onclick: () => this.like(c) },
          icon("heart", c.hasLiked),
          c.likeCount > 0 ? String(c.likeCount) : "",
        ),
        canAct && h("button", { type: "button", class: GHOST, onclick: () => this.startReply(c, top) }, icon("reply"), "Reply"),
        mine &&
          canAct &&
          h(
            "div",
            { class: "relative" },
            h("button", { type: "button", class: GHOST, "aria-label": "More actions", "aria-haspopup": "menu", "aria-expanded": String(this.menu === c.id), onclick: () => ((this.menu = this.menu === c.id ? null : c.id), this.render()) }, icon("more")),
            this.menu === c.id &&
              h(
                "div",
                { role: "menu", class: "absolute left-0 top-full z-30 mt-1 flex w-32 flex-col rounded-lg border bg-popover p-1 shadow-md" },
                h("button", { type: "button", role: "menuitem", class: `${BTN} h-8 justify-start px-2 hover:bg-muted`, onclick: () => ((this.editing = c.id), (this.drafts.edit = c.body), (this.menu = null), (this.reply = null), (this.focus = "edit"), this.render()) }, icon("pencil"), "Edit"),
                h("button", { type: "button", role: "menuitem", class: `${BTN} h-8 justify-start px-2 text-destructive hover:bg-destructive/10`, onclick: () => ((this.confirming = c.id), (this.menu = null), this.render()) }, icon("trash"), "Delete"),
              ),
          ),
      );

    const confirm =
      this.confirming === c.id &&
      h(
        "div",
        { role: "alertdialog", "aria-label": "Delete comment", class: "flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3" },
        h("p", {}, "Delete this comment? This action cannot be undone."),
        h(
          "div",
          { class: "flex gap-2" },
          h("button", { type: "button", class: OUTLINE, onclick: () => ((this.confirming = null), this.render()) }, "Cancel"),
          h("button", { type: "button", class: `${BTN} h-9 px-3 bg-destructive text-white hover:bg-destructive/90`, onclick: () => this.remove(c) }, "Delete"),
        ),
      );

    return h(
      "article",
      { id: `comment-${c.id}`, "data-id": c.id, class: "flex gap-3" },
      removed ? h("span", { "aria-hidden": "true", class: `${small ? "size-6" : "size-8"} flex shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground` }, icon("userX")) : this.avatar(c.commenter, small),
      h(
        "div",
        { class: "flex min-w-0 flex-1 flex-col gap-1" },
        head,
        this.editing === c.id ? this.form("edit", { placeholder: "Edit your comment…", submit: "Save", busy: "Saving…", label: "Edit comment", onCancel: () => ((this.editing = null), this.render()) }) : !removed && this.body(c.body),
        this.editing !== c.id && actions,
        confirm,
        !small &&
          (c.replies.length > 0 || this.reply?.parentId === c.id) &&
          h(
            "div",
            { class: "mt-2 flex flex-col gap-4 border-l pl-4" },
            ...c.replies.map((r) => this.item(r, c)),
            this.reply?.parentId === c.id && this.form("reply", { placeholder: "Write a reply…", submit: "Reply", busy: "Posting…", label: `Reply to ${this.reply.name}`, onCancel: () => ((this.reply = null), this.render()) }),
          ),
      ),
    );
  }

  render() {
    // Keep the caret where it was when an async result redraws the widget.
    const active = this.shadow.activeElement as HTMLTextAreaElement | null;
    const keep = active?.dataset.kind ? { kind: active.dataset.kind, start: active.selectionStart, end: active.selectionEnd } : null;
    const mention = this.mention;
    this.hideMentions();
    const user = this.auth?.user;
    const count = this.comments.reduce((n, c) => n + (c.status !== "DELETED" ? 1 : 0) + c.replies.filter((r) => r.status !== "DELETED").length, 0);
    const skeleton = () =>
      h("div", { class: "flex animate-pulse gap-3", "aria-hidden": "true" }, h("div", { class: "size-8 shrink-0 rounded-full bg-muted" }), h("div", { class: "flex flex-1 flex-col gap-2" }, h("div", { class: "h-3 w-32 rounded bg-muted" }), h("div", { class: "h-3 w-full rounded bg-muted" }), h("div", { class: "h-3 w-2/3 rounded bg-muted" })));

    const authBar = user
      ? h(
          "div",
          { class: "flex items-center gap-2 rounded-lg border px-3 py-2" },
          this.avatar(user, true),
          h("span", { class: "min-w-0 flex-1 truncate font-medium" }, user.name),
          !this.banned &&
            h(
              "button",
              { type: "button", class: GHOST, "aria-pressed": String(this.notifications), "aria-label": this.notifications ? "Mute email notifications" : "Turn on email notifications", title: this.notifications ? "Email me about replies and likes: on" : "Email me about replies and likes: off", onclick: () => this.toggleNotifications() },
              icon(this.notifications ? "bell" : "bellOff"),
            ),
          h("button", { type: "button", class: GHOST, onclick: () => this.signOut() }, "Sign out"),
        )
      : h(
          "div",
          { class: "flex items-center justify-between gap-2 rounded-lg border px-3 py-2" },
          h("span", { class: "text-muted-foreground" }, "Sign in to comment"),
          this.signingIn || !this.config?.providers?.length
            ? h("button", { type: "button", class: PRIMARY, disabled: this.signingIn || !!this.preview, onclick: () => this.signIn() }, this.signingIn ? "Signing in…" : "Sign in")
            : h("span", { class: "flex flex-wrap justify-end gap-2" }, ...this.config.providers.map((p) => this.providerButton(p))),
        );

    const footer = h("p", { class: "text-center text-xs text-muted-foreground" });
    if (this.config?.poweredByHtml) footer.innerHTML = this.config.poweredByHtml; // our own server's fixed string

    const parts: Child[] = [
      h("h2", { class: "text-base font-semibold" }, this.state === "ready" ? `${count} ${count === 1 ? "Comment" : "Comments"}` : "Comments"),
      this.banned && h("div", { role: "alert", class: "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive" }, h("p", { class: "font-medium" }, "You're Banned"), h("p", { class: "text-xs" }, "You can read comments here but can't post, reply or like.")),
      this.state !== "error" && authBar,
      user && !this.banned && this.state === "ready" && this.form("main", { placeholder: "Write a comment…", submit: "Post comment", busy: "Posting…", label: "Write a comment" }),
      this.error && h("p", { role: "alert", class: "rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive" }, this.error),
      this.state === "loading" && h("div", { class: "flex flex-col gap-5" }, skeleton(), skeleton(), skeleton()),
      this.state === "error" && h("p", { role: "alert", class: "py-6 text-center text-muted-foreground" }, "Failed to load comments. Please try again later."),
      this.state === "ready" &&
        (this.comments.length
          ? h("div", { class: "flex flex-col gap-6" }, ...this.comments.map((c) => this.item(c, c)))
          : h("div", { class: "flex flex-col items-center gap-1 rounded-lg border border-dashed py-10 text-center" }, h("p", { class: "font-medium" }, "No comments yet"), h("p", { class: "text-muted-foreground" }, "Be the first to share your thoughts."))),
      this.state === "ready" && footer,
    ];
    this.root.replaceChildren(...(parts.filter(Boolean) as Node[]));

    const want = this.focus ?? keep?.kind;
    const area = want && this.root.querySelector<HTMLTextAreaElement>(`textarea[data-kind="${want}"]`);
    if (area) {
      area.focus();
      if (this.focus) area.selectionStart = area.selectionEnd = area.value.length;
      else if (keep) [area.selectionStart, area.selectionEnd] = [keep.start, keep.end];
      // An open mention list survives the redraw.
      if (mention && keep?.kind === want) (this.showMentions(area, mention.items, mention.start), (this.mention!.index = mention.index), this.drawMentions());
    }
    this.focus = null;
  }
}

/** Mounts every not-yet-mounted [data-wuppy-comments] on the page. */
const mount = () =>
  [...document.querySelectorAll<HTMLElement>("[data-wuppy-comments]")].flatMap((el) => {
    if (el.dataset.wuppyMounted) return [];
    const key = el.dataset.siteKey;
    if (!key) return console.warn("[WuppyComments] Missing data-site-key", el), [];
    el.dataset.wuppyMounted = "";
    return [new Widget(el, key, el.dataset.slug || location.pathname.replace(/\/+$/, "") || "/")];
  });

/** The CMS settings page's live preview: sample comments, no API calls. Returns a cleanup. */
const preview = (el: HTMLElement, theme: Theme) => {
  const w = new Widget(el, "preview", "/", theme);
  return () => (w.destroy(), w.shadow.replaceChildren());
};

// Astro view transitions run the inline script tag again on each page: mount once, then on every page load.
if (!(window as any).WuppyComments) {
  (window as any).WuppyComments = { mount, preview };
  document.addEventListener("astro:page-load", mount);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
} else (window as any).WuppyComments.mount();
