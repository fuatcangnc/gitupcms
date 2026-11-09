import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { button } from "@/components/ui/island";

export { post } from "@/lib/post";

export type Status = "PENDING" | "APPROVED" | "SPAM" | "DELETED";
export type AdminComment = {
  id: string;
  body: string;
  status: Status;
  createdAt: string;
  editedAt: string | null;
  parentId: string | null;
  page: { slug: string; url: string | null };
  commenter: { id: string; name: string; email: string; username: string; image: string | null };
  replyCount: number;
  likeCount: number;
};

export const STATUS_LABEL: Record<Status, string> = { PENDING: "Pending", APPROVED: "Approved", SPAM: "Spam", DELETED: "Removed" };
const TONE: Record<Status, string> = {
  PENDING: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  APPROVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  SPAM: "border-destructive/30 bg-destructive/10 text-destructive",
  DELETED: "text-muted-foreground",
};
export const StatusBadge = ({ status }: { status: Status }) => <span className={`inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium ${TONE[status]}`}>{STATUS_LABEL[status]}</span>;

export const Avatar = ({ name, image, size = 8 }: { name: string; image: string | null; size?: 6 | 8 | 10 }) => {
  const cls = { 6: "size-6 text-[10px]", 8: "size-8 text-xs", 10: "size-10 text-sm" }[size];
  return image ? <img src={image} alt="" className={`${cls} shrink-0 rounded-full object-cover`} referrerPolicy="no-referrer" /> : <span className={`${cls} bg-muted flex shrink-0 items-center justify-center rounded-full font-medium uppercase`}>{name.slice(0, 2)}</span>;
};

export const when = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

/** Native <dialog> (house pattern): open while mounted, Escape and the close button call onClose. */
export const Modal = ({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) => {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => ref.current?.showModal(), []);
  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} className={`bg-background text-foreground m-auto ${wide ? "w-[min(48rem,calc(100vw-2rem))]" : "w-[min(28rem,calc(100vw-2rem))]"} rounded-xl border p-0 shadow-lg backdrop:bg-black/50`}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-medium">{title}</h2>
        <button type="button" className={button("ghost", "icon")} aria-label="Close" onClick={() => ref.current?.close()}>
          <X />
        </button>
      </div>
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto p-4">{children}</div>
    </dialog>
  );
};

/** Prev / next for a paged list. */
export const Pager = ({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (p: number) => void }) =>
  total > limit ? (
    <div className="text-muted-foreground flex items-center justify-between text-sm">
      <span>
        {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
      </span>
      <span className="flex gap-2">
        <button type="button" className={button("outline", "sm")} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className={button("outline", "sm")} disabled={page * limit >= total} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  ) : null;
