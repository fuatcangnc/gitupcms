import { useEffect, useState } from "react";
import { Check, Clock, Copy, ExternalLink, Eye, FileText, Loader2, MessageSquare, Pencil, Search, ShieldX, Trash2 } from "lucide-react";
import { button, inputClass } from "@/components/ui/island";
import { Avatar, Modal, Pager, post, StatusBadge, when, type AdminComment, type Status } from "./shared";

type Page = { id: string; slug: string; url: string | null; total: number; pending: number };
type List = { comments: AdminComment[]; total: number; page: number; limit: number };
// Laid out like the Configure site dialog: statuses and pages on the left, the list on the right.
const FILTERS = [
  { value: "", label: "All comments", icon: MessageSquare, color: "text-sky-500" },
  { value: "PENDING", label: "Pending", icon: Clock, color: "text-amber-500" },
  { value: "APPROVED", label: "Approved", icon: Check, color: "text-emerald-500" },
  { value: "SPAM", label: "Spam", icon: ShieldX, color: "text-orange-500" },
  { value: "DELETED", label: "Removed", icon: Trash2, color: "text-red-500" },
] as const satisfies { value: "" | Status; label: string; icon: unknown; color: string }[];

/** Comments tab: filter by page, status and text, moderate one or many, edit, delete pages. */
export default function CommentsModeration({ api, initialStatus, siteUrl }: { api: string; initialStatus: string; siteUrl: string | null }) {
  const [status, setStatus] = useState<"" | Status>(FILTERS.some((f) => f.value === initialStatus) ? (initialStatus as Status) : "");
  const [slug, setSlug] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [pageFilter, setPageFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<AdminComment | null>(null);
  const [log, setLog] = useState<{ action: string; adminEmail: string; createdAt: string }[] | null>(null);
  const [editing, setEditing] = useState<AdminComment | null>(null);
  const [draft, setDraft] = useState("");
  const [deletingPage, setDeletingPage] = useState<Page | null>(null);
  const [typed, setTyped] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let live = true;
    post(api, { action: "list", status, slug, search, page }).then(
      (d) => live && (setList(d), setSelected(new Set())),
      (e) => live && setError(e.message),
    );
    return () => void (live = false);
  }, [api, status, slug, search, page, refresh]);
  useEffect(() => void post(api, { action: "pages" }).then(setPages, (e) => setError(e.message)), [api, refresh]);
  useEffect(() => {
    const t = setTimeout(() => (setSearch(query), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [query]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setRefresh((n) => n + 1);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };
  const moderate = (ids: string[], to: Status) => run(() => post(api, { action: "moderate", ids, status: to }));
  const open = async (c: AdminComment) => {
    setViewing(c);
    setLog(null);
    post(api, { action: "log", id: c.id }).then(setLog, () => setLog([]));
  };
  const urlOf = (p: { slug: string; url: string | null }) => p.url ?? (siteUrl ? `${siteUrl}${p.slug.startsWith("/") ? "" : "/"}${p.slug}` : null);
  const rows = list?.comments ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const pendingTotal = pages.reduce((n, p) => n + p.pending, 0);
  const shownPages = pages.filter((p) => !pageFilter || p.slug.toLowerCase().includes(pageFilter.toLowerCase()));

  return (
    <div className="flex min-h-[640px] min-w-0 flex-col overflow-hidden rounded-xl border md:flex-row">
      <aside className="bg-sidebar flex shrink-0 flex-col border-b md:w-64 md:border-r md:border-b-0">
        <div className="flex h-14 shrink-0 items-center border-b px-4 font-semibold">Comments</div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col" aria-label="Status">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => (setStatus(f.value), setPage(1))}
              aria-current={status === f.value ? "step" : undefined}
              className="hover:bg-sidebar-accent aria-[current=step]:bg-sidebar-accent flex shrink-0 items-center gap-3 rounded-lg px-2 py-2 text-left"
            >
              <span className={`bg-background flex size-8 shrink-0 items-center justify-center rounded-lg border ${f.color}`}>
                <f.icon className="size-4" />
              </span>
              <span className="flex-1 text-sm font-medium">{f.label}</span>
              {f.value === "PENDING" && pendingTotal > 0 && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white tabular-nums">{pendingTotal}</span>}
            </button>
          ))}
        </nav>
        <div className="flex min-h-0 flex-col gap-2 border-t p-2" aria-label="Pages" role="group">
        <span className="text-muted-foreground flex items-center gap-1.5 px-2 pt-1 text-xs font-medium">
          <FileText className="size-3.5" /> Pages ({pages.length})
        </span>
        <input aria-label="Filter pages" placeholder="Filter pages" className={`${inputClass} h-8`} value={pageFilter} onChange={(e) => setPageFilter(e.target.value)} />
        <ul className="flex max-h-[28rem] flex-col gap-0.5 overflow-y-auto text-sm">
          <li>
            <button type="button" className={`hover:bg-sidebar-accent w-full rounded-md px-2 py-1.5 text-left ${!slug ? "bg-sidebar-accent font-medium" : ""}`} onClick={() => (setSlug(""), setPage(1))}>
              All pages
            </button>
          </li>
          {shownPages.map((p) => (
            <li key={p.id} className={`group flex items-center gap-1 rounded-md ${slug === p.slug ? "bg-sidebar-accent" : "hover:bg-sidebar-accent"}`}>
              <button type="button" className={`min-w-0 flex-1 px-2 py-1.5 text-left ${slug === p.slug ? "font-medium" : ""}`} onClick={() => (setSlug(p.slug), setPage(1))} title={p.slug}>
                <span className="block truncate font-mono text-xs">{p.slug}</span>
                <span className="text-muted-foreground text-xs">
                  {p.total} comment{p.total === 1 ? "" : "s"}
                  {p.pending ? ` · ${p.pending} pending` : ""}
                </span>
              </button>
              <span className="flex opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                <button type="button" className={button("ghost", "icon")} aria-label={`Copy ${p.slug}`} title="Copy path" onClick={() => navigator.clipboard.writeText(p.slug)}>
                  <Copy />
                </button>
                {urlOf(p) && (
                  <a className={button("ghost", "icon")} href={urlOf(p)!} target="_blank" rel="noopener noreferrer" aria-label={`Open ${p.slug}`} title="Open page">
                    <ExternalLink />
                  </a>
                )}
                <button type="button" className={button("ghost", "icon")} aria-label={`Delete ${p.slug} and its comments`} title="Delete page and its comments" onClick={() => (setDeletingPage(p), setTyped(""))}>
                  <Trash2 />
                </button>
              </span>
            </li>
          ))}
          {!shownPages.length && <li className="text-muted-foreground px-2 py-1.5 text-xs">{pages.length ? "No pages match." : "No pages with comments yet."}</li>}
        </ul>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-6">
          <h2 className="flex min-w-0 items-baseline gap-2 text-lg font-semibold">
            {FILTERS.find((f) => f.value === status)!.label}
            {slug && <span className="text-muted-foreground truncate font-mono text-xs font-normal">{slug}</span>}
            {list && <span className="text-muted-foreground text-xs font-normal tabular-nums">{list.total}</span>}
          </h2>
          <label className="relative ml-auto w-full max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <input aria-label="Search comments" placeholder="Search text, name or email" className={`${inputClass} h-9 pl-8`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </header>
        <div className="flex min-w-0 flex-col gap-3 p-6">
        {selected.size > 0 && (
          <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <span className="mr-auto">{selected.size} selected</span>
            <button type="button" className={button("outline", "sm")} disabled={busy} onClick={() => moderate([...selected], "APPROVED")}>
              <Check /> Approve
            </button>
            <button type="button" className={button("outline", "sm")} disabled={busy} onClick={() => moderate([...selected], "SPAM")}>
              <ShieldX /> Spam
            </button>
            <button type="button" className={button("destructive", "sm")} disabled={busy} onClick={() => moderate([...selected], "DELETED")}>
              <Trash2 /> Remove
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b text-left text-xs">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input type="checkbox" aria-label="Select all" checked={allChecked} onChange={(e) => setSelected(new Set(e.target.checked ? rows.map((r) => r.id) : []))} />
                </th>
                <th className="px-3 py-2 font-medium">Comment</th>
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!list && (
                <tr>
                  <td colSpan={5} className="p-6 text-center">
                    <Loader2 className="text-muted-foreground mx-auto size-4 animate-spin" />
                  </td>
                </tr>
              )}
              {list && !rows.length && (
                <tr>
                  <td colSpan={5} className="text-muted-foreground p-6 text-center">
                    {search || status || slug ? "No comments match." : "No comments yet."}
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="px-3 py-3">
                    <input type="checkbox" aria-label={`Select comment by ${c.commenter.name}`} checked={selected.has(c.id)} onChange={(e) => setSelected((s) => (e.target.checked ? new Set(s).add(c.id) : new Set([...s].filter((i) => i !== c.id))))} />
                  </td>
                  <td className="max-w-md px-3 py-3">
                    <div className="flex gap-2">
                      <Avatar name={c.commenter.name} image={c.commenter.image} size={6} />
                      <div className="min-w-0">
                        <p className="text-xs">
                          <span className="font-medium">{c.commenter.name}</span> <span className="text-muted-foreground">{c.commenter.email}</span>
                        </p>
                        <p className={`line-clamp-2 break-words ${c.status === "DELETED" ? "text-muted-foreground line-through" : ""}`}>{c.body}</p>
                        <p className="text-muted-foreground text-xs">
                          {when(c.createdAt)}
                          {c.parentId ? " · reply" : ""}
                          {c.replyCount ? ` · ${c.replyCount} repl${c.replyCount === 1 ? "y" : "ies"}` : ""}
                          {c.likeCount ? ` · ${c.likeCount} like${c.likeCount === 1 ? "" : "s"}` : ""}
                          {c.editedAt ? " · edited" : ""}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {urlOf(c.page) ? (
                      <a className="font-mono text-xs underline-offset-2 hover:underline" href={`${urlOf(c.page)}#comment-${c.id}`} target="_blank" rel="noopener noreferrer">
                        {c.page.slug}
                      </a>
                    ) : (
                      <span className="font-mono text-xs">{c.page.slug}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-3">
                    <span className="flex justify-end gap-0.5">
                      <button type="button" className={button("ghost", "icon")} aria-label="View" title="View" onClick={() => open(c)}>
                        <Eye />
                      </button>
                      <button type="button" className={button("ghost", "icon")} aria-label="Edit" title="Edit" onClick={() => (setEditing(c), setDraft(c.body))}>
                        <Pencil />
                      </button>
                      {c.status !== "APPROVED" && (
                        <button type="button" className={button("ghost", "icon")} aria-label="Approve" title="Approve" disabled={busy} onClick={() => moderate([c.id], "APPROVED")}>
                          <Check />
                        </button>
                      )}
                      {c.status !== "SPAM" && (
                        <button type="button" className={button("ghost", "icon")} aria-label="Mark as spam" title="Mark as spam" disabled={busy} onClick={() => moderate([c.id], "SPAM")}>
                          <ShieldX />
                        </button>
                      )}
                      {c.status !== "DELETED" && (
                        <button type="button" className={button("ghost", "icon")} aria-label="Remove" title="Remove" disabled={busy} onClick={() => moderate([c.id], "DELETED")}>
                          <Trash2 />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {list && <Pager page={list.page} total={list.total} limit={list.limit} onPage={setPage} />}
        </div>
      </div>

      {viewing && (
        <Modal title="Comment" onClose={() => setViewing(null)} wide>
          <div className="flex items-center gap-2">
            <Avatar name={viewing.commenter.name} image={viewing.commenter.image} />
            <div className="text-sm">
              <p className="font-medium">
                {viewing.commenter.name} <span className="text-muted-foreground font-normal">@{viewing.commenter.username}</span>
              </p>
              <p className="text-muted-foreground text-xs">{viewing.commenter.email}</p>
            </div>
            <span className="ml-auto">
              <StatusBadge status={viewing.status} />
            </span>
          </div>
          <p className="bg-muted/50 rounded-lg border p-3 text-sm break-words whitespace-pre-wrap">{viewing.body}</p>
          <p className="text-muted-foreground text-xs">
            On <span className="font-mono">{viewing.page.slug}</span> · {when(viewing.createdAt)}
            {viewing.editedAt ? ` · edited ${when(viewing.editedAt)}` : ""}
          </p>
          <div>
            <p className="mb-1 text-xs font-medium">Moderation history</p>
            {!log ? (
              <Loader2 className="text-muted-foreground size-4 animate-spin" />
            ) : log.length ? (
              <ul className="text-muted-foreground text-xs">
                {log.map((l, i) => (
                  <li key={i}>
                    {l.action.toLowerCase()} by {l.adminEmail} · {when(l.createdAt)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">Not moderated yet.</p>
            )}
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit ${editing.commenter.name}'s comment`} onClose={() => setEditing(null)} wide>
          <textarea aria-label="Comment" className={`${inputClass} min-h-32 py-2`} value={draft} maxLength={5000} onChange={(e) => setDraft(e.target.value)} />
          <p className="text-muted-foreground text-xs">{draft.length} / 5000 · shown as edited</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={button("outline")} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className={button("primary")} disabled={busy || !draft.trim()} onClick={() => run(() => post(api, { action: "edit", id: editing.id, body: draft })).then(() => setEditing(null))}>
              Save
            </button>
          </div>
        </Modal>
      )}

      {deletingPage && (
        <Modal title="Delete page and comments" onClose={() => setDeletingPage(null)}>
          <p className="text-sm">
            This deletes <span className="font-mono">{deletingPage.slug}</span> and its {deletingPage.total} comment{deletingPage.total === 1 ? "" : "s"} for good. It can't be undone.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Type the page path to confirm
            <input className={`${inputClass} h-9 font-mono`} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className={button("outline")} onClick={() => setDeletingPage(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={button("destructive")}
              disabled={busy || typed !== deletingPage.slug}
              onClick={() => run(() => post(api, { action: "deletePage", id: deletingPage.id })).then(() => (deletingPage.slug === slug && setSlug(""), setDeletingPage(null)))}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
