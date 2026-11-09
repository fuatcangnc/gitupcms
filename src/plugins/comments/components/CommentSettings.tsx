import { useEffect, useState, type ReactNode } from "react";
import { Database, Download, Globe, KeyRound, Loader2, Mail, Send, Trash2 } from "lucide-react";
import { button, inputClass } from "@/components/ui/island";
import { Select } from "@/components/ui/select/react";
import { Modal, post } from "./shared";

type Settings = {
  key: string;
  domain: string;
  allowedOrigins: string[];
  autoApprove: boolean;
  theme: "AUTO" | "LIGHT" | "DARK";
  primaryColor: string;
  radius: number;
  emailEnabled: boolean;
  likeLimit: number;
  subjectPrefix: string | null;
  logoUrl: string | null;
  accentColor: string | null;
  footerText: string | null;
  notifyEmail: string | null;
  smtpHost: string | null;
  smtpPort: number | null;
  smtpUser: string | null;
  smtpFrom: string | null;
  hasSmtpPass: boolean;
  signIn: { provider: "google" | "github"; clientId: string; hasSecret: boolean; callbackUrl: string; server: boolean; serverCallbackUrl: string }[];
};
const PROVIDER = { google: "Google", github: "GitHub" };
const CONSOLE = { google: "https://console.cloud.google.com/apis/credentials", github: "https://github.com/settings/applications/new" };

declare global {
  interface Window {
    GitupcmsComments?: { mount: () => unknown; preview: (el: HTMLElement, config: { theme: string; primaryColor: string; radius: number }) => () => void };
  }
}

const card = "flex flex-col gap-4";
// Same layout as the Configure site dialog, inline: sections on the left, one at a time on the right.
const SECTIONS = [
  { id: "general", title: "General", subtitle: "Domain and moderation", icon: Globe, color: "text-orange-500" },
  { id: "signin", title: "Sign-in", subtitle: "Google and GitHub apps", icon: KeyRound, color: "text-sky-500" },
  { id: "email", title: "Email notifications", subtitle: "Branding and SMTP", icon: Mail, color: "text-pink-500" },
  { id: "data", title: "Your data", subtitle: "Export or delete", icon: Database, color: "text-amber-500" },
] as const;
type Tab = (typeof SECTIONS)[number]["id"];
const label = "flex flex-col gap-1.5 text-sm font-medium";
const hint = "text-muted-foreground text-xs font-normal";
const Field = ({ title, help, children }: { title: string; help?: ReactNode; children: ReactNode }) => (
  <label className={label}>
    {title}
    {children}
    {help && <span className={hint}>{help}</span>}
  </label>
);

/** Settings tab: where comments may come from, sign-in, notification emails, and your data. (Looks: AI Editor → Layers.) */
export default function CommentSettings({ api, confirmName }: { api: string; confirmName: string }) {
  const [tab, setTab] = useState<Tab>("general");
  const [s, setS] = useState<Settings | null>(null);
  const [origins, setOrigins] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [secrets, setSecrets] = useState({ google: "", github: "" });
  const [saved, setSaved] = useState("");
  const [message, setMessage] = useState<{ error?: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewType, setPreviewType] = useState("new-comment");
  const [html, setHtml] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    post(api, { action: "settings" }).then(
      (d: Settings) => (setS(d), setOrigins(d.allowedOrigins.join("\n")), setSaved(JSON.stringify({ ...d, allowedOrigins: d.allowedOrigins.join("\n") }))),
      (e) => setMessage({ error: true, text: e.message }),
    );
  }, [api]);

  useEffect(() => {
    if (!s) return;
    const t = setTimeout(() => post(api, { action: "emailPreview", type: previewType, settings: { accentColor: s.accentColor, logoUrl: s.logoUrl, footerText: s.footerText } }).then((d) => setHtml(d.html), () => {}), 250);
    return () => clearTimeout(t);
  }, [api, previewType, s?.accentColor, s?.logoUrl, s?.footerText, !!s]);

  if (!s) return message ? <p className="text-destructive text-sm">{message.text}</p> : <Loader2 className="text-muted-foreground size-4 animate-spin" />;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const dirty = JSON.stringify({ ...s, allowedOrigins: origins }) !== saved || !!smtpPass || !!secrets.google || !!secrets.github;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      // Theme, color and radius are set in the AI Editor's Layers, so they aren't sent (or overwritten) from here.
      const { key: _key, hasSmtpPass: _has, signIn, theme: _t, primaryColor: _c, radius: _r, ...rest } = s;
      const apps = Object.fromEntries(signIn.map((a) => [a.provider, { clientId: a.clientId, clientSecret: secrets[a.provider] }]));
      const d: Settings = await post(api, { action: "saveSettings", settings: { ...rest, signIn: apps, allowedOrigins: origins.split(/[\n,]/), ...(smtpPass ? { smtpPass } : {}) } });
      setS(d);
      setOrigins(d.allowedOrigins.join("\n"));
      setSaved(JSON.stringify({ ...d, allowedOrigins: d.allowedOrigins.join("\n") }));
      setSmtpPass("");
      setSecrets({ google: "", github: "" });
      setMessage({ text: "Saved." });
    } catch (e: any) {
      setMessage({ error: true, text: e.message });
    }
    setBusy(false);
  };
  const act = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ text: await fn() });
    } catch (e: any) {
      setMessage({ error: true, text: e.message });
    }
    setBusy(false);
  };
  const download = () =>
    act(async () => {
      const data = await post(api, { action: "export" });
      const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })), download: `comments-${confirmName.replace("/", "-")}-${new Date().toISOString().slice(0, 10)}.json` });
      a.click();
      URL.revokeObjectURL(a.href);
      return `Exported ${data.comments.length} comments.`;
    });

  const current = SECTIONS.find((x) => x.id === tab)!;
  return (
    <div className="flex min-h-[640px] min-w-0 flex-col overflow-hidden rounded-xl border md:flex-row">
      <aside className="bg-sidebar flex shrink-0 flex-col border-b md:w-64 md:border-r md:border-b-0">
        <div className="flex h-14 shrink-0 items-center border-b px-4 font-semibold">Comment settings</div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col" aria-label="Comment settings sections">
          {SECTIONS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              aria-current={tab === x.id ? "step" : undefined}
              className="hover:bg-sidebar-accent aria-[current=step]:bg-sidebar-accent flex shrink-0 items-center gap-3 rounded-lg px-2 py-2 text-left"
            >
              <span className={`bg-background flex size-8 shrink-0 items-center justify-center rounded-lg border ${x.color}`}>
                <x.icon className="size-4" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium">{x.title}</span>
                <span className="text-muted-foreground hidden truncate text-xs md:block">{x.subtitle}</span>
              </span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
          <h2 className="text-lg font-semibold">{current.title}</h2>
          {dirty && <span className="text-muted-foreground text-xs">Unsaved changes</span>}
          {message && (
            <p role={message.error ? "alert" : "status"} className={`ml-2 truncate text-sm ${message.error ? "text-destructive" : "text-muted-foreground"}`}>
              {message.text}
            </p>
          )}
          <button type="button" className={`${button("primary")} ml-auto`} disabled={busy || !dirty} onClick={save}>
            {busy && <Loader2 className="animate-spin" />} Save
          </button>
        </header>
        <div className="p-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {tab === "general" && (
      <section className={card}>
        <Field title="Site domain" help="Comments can be posted from this domain. Notification links use it too.">
          <input className={`${inputClass} h-9`} placeholder="example.com" value={s.domain} onChange={(e) => set("domain", e.target.value)} />
        </Field>
        <Field title="Other allowed origins" help={<>One per line: https://preview.example.com, *.example.com or * for any. With no domain and no origins, any site can post.</>}>
          <textarea className={`${inputClass} min-h-20 py-2 font-mono`} value={origins} onChange={(e) => setOrigins(e.target.value)} />
        </Field>
        <label className="flex items-start justify-between gap-4 text-sm font-medium">
          <span className="flex flex-col gap-1">
            Approve comments automatically
            <span className={hint}>Off: new comments wait in Pending until someone approves them. Their author sees them meanwhile.</span>
          </span>
          <input type="checkbox" role="switch" className="mt-0.5 size-4 accent-current" checked={s.autoApprove} onChange={(e) => set("autoApprove", e.target.checked)} />
        </label>
      </section>
      )}

      {tab === "signin" && (
      <section className={card}>
        <p className={hint}>
          Commenters sign in with Google or GitHub through your own OAuth apps. Create one, paste its redirect URL below into the app, then its client ID and secret here. Clear the client ID to remove an app.
        </p>
        {s.signIn.map((a, i) => (
          <div key={a.provider} className="flex flex-col gap-3 border-t pt-4 first-of-type:border-t-0">
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              {PROVIDER[a.provider]}
              <a className="text-muted-foreground text-xs font-normal underline underline-offset-2" href={CONSOLE[a.provider]} target="_blank" rel="noreferrer">
                {a.provider === "google" ? "Google Cloud credentials" : "New GitHub OAuth app"}
              </a>
            </span>
            <Field title={a.provider === "google" ? "Authorized redirect URI" : "Authorization callback URL"} help={!a.clientId && a.server ? <>Empty: the server's own {PROVIDER[a.provider]} app is used (redirect {a.serverCallbackUrl}).</> : undefined}>
              <input readOnly className={`${inputClass} h-9 font-mono`} value={a.callbackUrl} onFocus={(e) => e.target.select()} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field title="Client ID">
                <input className={`${inputClass} h-9 font-mono`} autoComplete="off" value={a.clientId} onChange={(e) => set("signIn", s.signIn.map((x, j) => (j === i ? { ...x, clientId: e.target.value } : x)))} />
              </Field>
              <Field title="Client secret" help={a.hasSecret ? "Saved (encrypted). Type a new one to replace it." : "Stored encrypted."}>
                <input type="password" className={`${inputClass} h-9 font-mono`} autoComplete="new-password" placeholder={a.hasSecret ? "••••••••" : ""} value={secrets[a.provider]} onChange={(e) => setSecrets({ ...secrets, [a.provider]: e.target.value })} />
              </Field>
            </div>
          </div>
        ))}
      </section>
      )}

      {tab === "email" && (
      <section className={card}>
        <label className="flex items-start justify-between gap-4 text-sm font-medium">
          <span className="flex flex-col gap-1">
            Send notification emails
            <span className={hint}>New comments to you, replies and mentions to their author, likes up to the limit below. Each email has an unsubscribe link.</span>
          </span>
          <input type="checkbox" role="switch" className="mt-0.5 size-4 accent-current" checked={s.emailEnabled} onChange={(e) => set("emailEnabled", e.target.checked)} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field title="Send new comments to" help="Empty: no new-comment emails.">
            <input type="email" className={`${inputClass} h-9`} value={s.notifyEmail ?? ""} onChange={(e) => set("notifyEmail", e.target.value)} />
          </Field>
          <Field title="Like emails per comment" help="0 turns like emails off.">
            <input type="number" min={0} max={100} className={`${inputClass} h-9`} value={s.likeLimit} onChange={(e) => set("likeLimit", Number(e.target.value))} />
          </Field>
          <Field title="Subject prefix">
            <input className={`${inputClass} h-9`} placeholder="[New Comment]" maxLength={50} value={s.subjectPrefix ?? ""} onChange={(e) => set("subjectPrefix", e.target.value)} />
          </Field>
          <Field title="Accent color">
            <span className="flex gap-2">
              <input type="color" aria-label="Pick the accent color" className="h-9 w-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1" value={s.accentColor ?? "#2563eb"} onChange={(e) => set("accentColor", e.target.value)} />
              <input className={`${inputClass} h-9 font-mono`} placeholder="#2563eb" maxLength={7} value={s.accentColor ?? ""} onChange={(e) => set("accentColor", e.target.value)} />
            </span>
          </Field>
          <Field title="Logo URL">
            <input className={`${inputClass} h-9`} placeholder="https://example.com/logo.png" value={s.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value)} />
          </Field>
          <Field title="Footer text">
            <input className={`${inputClass} h-9`} placeholder="You're receiving this because you commented on this site." maxLength={300} value={s.footerText ?? ""} onChange={(e) => set("footerText", e.target.value)} />
          </Field>
        </div>
        <p className={hint}>SMTP server: left empty, emails go through this CMS's own email (SMTP_URL), or the server log without it.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field title="SMTP host">
            <input className={`${inputClass} h-9`} placeholder="smtp.example.com" value={s.smtpHost ?? ""} onChange={(e) => set("smtpHost", e.target.value)} />
          </Field>
          <Field title="Port" help="465 uses TLS; others upgrade with STARTTLS.">
            <input type="number" className={`${inputClass} h-9`} placeholder="465" value={s.smtpPort ?? ""} onChange={(e) => set("smtpPort", e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field title="Username">
            <input className={`${inputClass} h-9`} autoComplete="off" value={s.smtpUser ?? ""} onChange={(e) => set("smtpUser", e.target.value)} />
          </Field>
          <Field title="Password" help={s.hasSmtpPass ? "Saved (encrypted). Type a new one to replace it." : "Stored encrypted."}>
            <input type="password" className={`${inputClass} h-9`} autoComplete="new-password" placeholder={s.hasSmtpPass ? "••••••••" : ""} value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)} />
          </Field>
          <Field title="From address" help="Defaults to the username when it is an email.">
            <input type="email" className={`${inputClass} h-9`} value={s.smtpFrom ?? ""} onChange={(e) => set("smtpFrom", e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Email preview</span>
            <Select aria-label="Email to preview" size="sm" value={previewType} onChange={setPreviewType} options={[{ value: "new-comment", label: "New comment" }, { value: "reply", label: "Reply" }, { value: "like", label: "Like" }]} />
          </span>
          <iframe title="Email preview" sandbox="" className="h-96 w-full rounded-lg border bg-white" srcDoc={html} />
          <button type="button" className={`${button("outline", "sm")} self-start`} disabled={busy || dirty} title={dirty ? "Save first" : undefined} onClick={() => act(async () => `Test email sent to ${(await post(api, { action: "testEmail" })).to}.`)}>
            <Send /> Send a test email to me
          </button>
        </div>
      </section>
      )}


      {tab === "data" && (
      <section className={card}>
        <p className="text-muted-foreground text-sm">
          Comments, commenters (name, email, picture), likes and the moderation log live only in this CMS's SQLite database on your server. Nothing is sent to a third party except sign-in (Google or GitHub) and the emails you set up. Commenters'
          emails are never shown on the site.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button("outline", "sm")} disabled={busy} onClick={download}>
            <Download /> Export all as JSON
          </button>
          <button type="button" className={button("destructive", "sm")} disabled={busy} onClick={() => (setDeleting(true), setTyped(""))}>
            <Trash2 /> Delete all comment data
          </button>
        </div>
      </section>
      )}

          </div>
        </div>
      </div>

      {deleting && (
        <Modal title="Delete all comment data" onClose={() => setDeleting(false)}>
          <p className="text-sm">Every comment, page, like, ban and setting of this site is deleted for good, and the plugin is turned off. Commenters who only commented here are deleted too. Export first if you may need them.</p>
          <label className="flex flex-col gap-1 text-sm">
            Type {confirmName} to confirm
            <input className={`${inputClass} h-9 font-mono`} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={button("outline")} onClick={() => setDeleting(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={button("destructive")}
              disabled={busy || typed !== confirmName}
              onClick={() => act(async () => (await post(api, { action: "deleteAll", confirm: typed }), location.assign(location.pathname.replace(/\/comments$/, "/plugins")), "Deleted."))}
            >
              Delete everything
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
