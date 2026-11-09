import { useEffect, useState } from "react";
import { Ban, Bell, BellOff, Eye, Loader2, Search, Trash2, Undo2, Users } from "lucide-react";
import { button, inputClass } from "@/components/ui/island";
import { Avatar, Modal, Pager, post, StatusBadge, when, type AdminComment } from "./shared";

type Commenter = { id: string; name: string; email: string; image: string | null; username: string; totalCount: number; deletedCount: number; spamCount: number; isBanned: boolean; notificationsEnabled: boolean };
type List = { commenters: Commenter[]; total: number; page: number; limit: number };

// Laid out like the Configure site dialog: filters on the left, the list on the right.
const FILTERS = [
  { value: "", label: "All users", icon: Users, color: "text-sky-500" },
  { value: "banned", label: "Banned", icon: Ban, color: "text-red-500" },
  { value: "muted", label: "Emails muted", icon: BellOff, color: "text-amber-500" },
] as const;

/** Users tab: who commented on this site; ban, remove all their comments, mute their reply emails. */
export default function Commenters({ api }: { api: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<List | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [profile, setProfile] = useState<Commenter | null>(null);
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [confirm, setConfirm] = useState<{ user: Commenter; kind: "ban" | "deleteAll" } | null>(null);

  useEffect(() => {
    let live = true;
    post(api, { action: "users", search, page, filter }).then(
      (d) => live && setList(d),
      (e) => live && setError(e.message),
    );
    return () => void (live = false);
  }, [api, search, page, filter, refresh]);
  useEffect(() => {
    const t = setTimeout(() => (setSearch(query), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [query]);

  const run = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      await post(api, body);
      setRefresh((n) => n + 1);
      setConfirm(null);
    } catch (e: any) {
      setError(e.message);
    }
    setBusy(false);
  };
  const open = (u: Commenter) => {
    setProfile(u);
    setComments(null);
    post(api, { action: "userComments", id: u.id }).then(setComments, (e) => setError(e.message));
  };

  return (
    <div className="flex min-h-[640px] min-w-0 flex-col overflow-hidden rounded-xl border md:flex-row">
      <aside className="bg-sidebar flex shrink-0 flex-col border-b md:w-64 md:border-r md:border-b-0">
        <div className="flex h-14 shrink-0 items-center border-b px-4 font-semibold">Users</div>
        <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col" aria-label="Filter users">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => (setFilter(f.value), setPage(1))}
              aria-current={filter === f.value ? "step" : undefined}
              className="hover:bg-sidebar-accent aria-[current=step]:bg-sidebar-accent flex shrink-0 items-center gap-3 rounded-lg px-2 py-2 text-left"
            >
              <span className={`bg-background flex size-8 shrink-0 items-center justify-center rounded-lg border ${f.color}`}>
                <f.icon className="size-4" />
              </span>
              <span className="text-sm font-medium">{f.label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-6">
          <h2 className="flex items-baseline gap-2 text-lg font-semibold">
            {FILTERS.find((f) => f.value === filter)!.label}
            {list && <span className="text-muted-foreground text-xs font-normal tabular-nums">{list.total}</span>}
          </h2>
          <label className="relative ml-auto w-full max-w-xs">
            <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <input aria-label="Search users" placeholder="Search name, email or username" className={`${inputClass} h-9 pl-8`} value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </header>
        <div className="flex min-w-0 flex-col gap-3 p-6">
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground border-b text-left text-xs">
            <tr>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 text-right font-medium">Comments</th>
              <th className="px-3 py-2 text-right font-medium">Removed</th>
              <th className="px-3 py-2 text-right font-medium">Spam</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!list && (
              <tr>
                <td colSpan={6} className="p-6 text-center">
                  <Loader2 className="text-muted-foreground mx-auto size-4 animate-spin" />
                </td>
              </tr>
            )}
            {list && !list.commenters.length && (
              <tr>
                <td colSpan={6} className="text-muted-foreground p-6 text-center">
                  {search || filter ? "No users match." : "Nobody has commented yet."}
                </td>
              </tr>
            )}
            {list?.commenters.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar name={u.name} image={u.image} />
                    <span className="min-w-0">
                      <span className="block font-medium">
                        {u.name} <span className="text-muted-foreground font-normal">@{u.username}</span>
                      </span>
                      <span className="text-muted-foreground block text-xs">{u.email}</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{u.totalCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.deletedCount}</td>
                <td className="px-3 py-2 text-right tabular-nums">{u.spamCount}</td>
                <td className="px-3 py-2">
                  {u.isBanned ? <span className="border-destructive/30 bg-destructive/10 text-destructive inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium">Banned</span> : <span className="text-muted-foreground text-xs">Active</span>}
                </td>
                <td className="px-3 py-2">
                  <span className="flex justify-end gap-0.5">
                    <button type="button" className={button("ghost", "icon")} aria-label={`View ${u.name}`} title="View profile and comments" onClick={() => open(u)}>
                      <Eye />
                    </button>
                    <button
                      type="button"
                      className={button("ghost", "icon")}
                      disabled={busy}
                      aria-label={u.notificationsEnabled ? `Mute email notifications for ${u.name}` : `Unmute email notifications for ${u.name}`}
                      title={u.notificationsEnabled ? "Reply emails on: mute" : "Reply emails off: unmute"}
                      onClick={() => run({ action: "setNotifications", id: u.id, enabled: !u.notificationsEnabled })}
                    >
                      {u.notificationsEnabled ? <Bell /> : <BellOff />}
                    </button>
                    {u.isBanned ? (
                      <button type="button" className={button("ghost", "icon")} disabled={busy} aria-label={`Unban ${u.name}`} title="Unban" onClick={() => run({ action: "unban", id: u.id })}>
                        <Undo2 />
                      </button>
                    ) : (
                      <button type="button" className={button("ghost", "icon")} disabled={busy} aria-label={`Ban ${u.name}`} title="Ban from commenting" onClick={() => setConfirm({ user: u, kind: "ban" })}>
                        <Ban />
                      </button>
                    )}
                    <button type="button" className={button("ghost", "icon")} disabled={busy || u.deletedCount === u.totalCount} aria-label={`Remove all comments by ${u.name}`} title="Remove all their comments" onClick={() => setConfirm({ user: u, kind: "deleteAll" })}>
                      <Trash2 />
                    </button>
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

      {confirm && (
        <Modal title={confirm.kind === "ban" ? `Ban ${confirm.user.name}?` : `Remove all comments by ${confirm.user.name}?`} onClose={() => setConfirm(null)}>
          <p className="text-sm">
            {confirm.kind === "ban"
              ? "They can still read comments but can't post, reply, edit or like on this site. Their removed comments show as “Account is suspended”. You can unban them later."
              : `Their ${confirm.user.totalCount - confirm.user.deletedCount} comment(s) on this site are marked as removed. Replies by others stay.`}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={button("outline")} onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button type="button" className={button("destructive")} disabled={busy} onClick={() => run({ action: confirm.kind, id: confirm.user.id })}>
              {confirm.kind === "ban" ? "Ban" : "Remove all"}
            </button>
          </div>
        </Modal>
      )}

      {profile && (
        <Modal title={profile.name} onClose={() => setProfile(null)} wide>
          <div className="flex items-center gap-3">
            <Avatar name={profile.name} image={profile.image} size={10} />
            <div className="text-sm">
              <p className="font-medium">
                {profile.name} <span className="text-muted-foreground font-normal">@{profile.username}</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {profile.email} · {profile.totalCount} comments · reply emails {profile.notificationsEnabled ? "on" : "off"}
                {profile.isBanned ? " · banned" : ""}
              </p>
            </div>
          </div>
          {!comments ? (
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          ) : (
            <ul className="divide-y rounded-lg border">
              {comments.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 p-3 text-sm">
                  <span className="text-muted-foreground flex items-center gap-2 text-xs">
                    <span className="font-mono">{c.page.slug}</span> · {when(c.createdAt)} <StatusBadge status={c.status} />
                  </span>
                  <span className="break-words whitespace-pre-wrap">{c.body}</span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}
