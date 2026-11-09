/**
 * Comment notification emails as plain HTML strings (inline styles, so mail clients keep them).
 */

export const EMAIL_DEFAULTS = {
  subjectPrefix: "[New Comment]",
  accentColor: "#2563eb",
  footerText: "You're receiving this because you commented on this site.",
};

export type Branding = { accentColor: string; logoUrl: string | null; footerText: string; siteUrl: string | null };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text);
const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? esc(url) : null);

const layout = (b: Branding, preview: string, content: string, unsubscribeUrl?: string | null) => {
  const site = safeUrl(b.siteUrl);
  const logo = safeUrl(b.logoUrl);
  const unsubscribe = safeUrl(unsubscribeUrl ?? null);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="background:#f6f9fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0">
<div style="display:none;max-height:0;overflow:hidden">${esc(preview)}</div>
<div style="max-width:580px;margin:0 auto;padding:20px 0">
${logo ? `<div style="padding:20px 24px 0">${site ? `<a href="${site}">` : ""}<img src="${logo}" height="32" alt="Logo">${site ? "</a>" : ""}</div>` : ""}
<div style="background:#ffffff;padding:24px;margin:16px 0;border-top:3px solid ${esc(b.accentColor)}">${content}</div>
<div style="padding:0 24px"><hr style="border:none;border-top:1px solid #e5e7eb">
<p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:8px 0 0">${esc(b.footerText)}${unsubscribe ? ` · <a href="${unsubscribe}" style="color:#9ca3af">Unsubscribe</a>` : ""}</p></div>
</div></body></html>`;
};

const heading = (text: string) => `<h1 style="font-size:18px;font-weight:600;margin:0 0 12px;color:#111827">${esc(text)}</h1>`;
const quote = (text: string, color: string, strong = false) =>
  `<p style="background:#f9fafb;border-left:3px solid ${esc(color)};padding:10px 14px;margin:0 0 ${strong ? 20 : 14}px;font-size:${strong ? 14 : 13}px;color:${strong ? "#374151" : "#6b7280"};border-radius:0 4px 4px 0;white-space:pre-wrap">${esc(text)}</p>`;
const button = (href: string, label: string, color: string) =>
  `<a href="${safeUrl(href) ?? "#"}" style="background:${esc(color)};color:#ffffff;padding:10px 20px;font-size:14px;font-weight:600;text-decoration:none;display:inline-block">${esc(label)}</a>`;

export const newCommentEmail = (b: Branding, p: { commenterName: string; pageTitle: string; commentBody: string; viewUrl: string }) =>
  layout(
    b,
    `${p.commenterName} commented on "${p.pageTitle}"`,
    `${heading("New comment")}<p style="color:#6b7280;margin:0 0 8px;font-size:13px"><strong style="color:#374151">${esc(p.commenterName)}</strong> commented on &ldquo;${esc(p.pageTitle)}&rdquo;:</p>${quote(p.commentBody, b.accentColor, true)}${button(p.viewUrl, "View Comment", b.accentColor)}`,
  );

export const replyEmail = (b: Branding, p: { replierName: string; pageTitle: string; originalBody: string; replyBody: string; viewUrl: string; unsubscribeUrl: string }) =>
  layout(
    b,
    `${p.replierName} replied to your comment on "${p.pageTitle}"`,
    `${heading("Someone replied to your comment")}<p style="color:#9ca3af;margin:0 0 6px;font-size:13px">Your comment on &ldquo;${esc(p.pageTitle)}&rdquo;:</p>${quote(p.originalBody, "#d1d5db")}<p style="color:#6b7280;margin:0 0 8px;font-size:13px"><strong style="color:#374151">${esc(p.replierName)}</strong> replied:</p>${quote(p.replyBody, b.accentColor, true)}${button(p.viewUrl, "View Reply", b.accentColor)}`,
    p.unsubscribeUrl,
  );

export const likeEmail = (b: Branding, p: { pageTitle: string; commentBody: string; viewUrl: string; likeCount: number; unsubscribeUrl: string }) =>
  layout(
    b,
    `Your comment received ${p.likeCount} ${p.likeCount === 1 ? "like" : "likes"}`,
    `${heading(`Your comment received ${p.likeCount} ${p.likeCount === 1 ? "like" : "likes"}`)}<p style="color:#9ca3af;margin:0 0 6px;font-size:13px">Your comment on &ldquo;${esc(p.pageTitle)}&rdquo;:</p>${quote(p.commentBody, b.accentColor, true)}${button(p.viewUrl, "View Comment", b.accentColor)}`,
    p.unsubscribeUrl,
  );
