/**
 * The admin panel's actions ({ action, ... }), shared by the CMS and Gitupcms. The host checks who may call it:
 * moderation needs an editor, ADMIN_ACTIONS an admin.
 */
import { HttpError } from "../../../lib/github";
import * as c from "./comments";

export const ADMIN_ACTIONS = new Set(["settings", "saveSettings", "emailPreview", "testEmail", "export", "deleteAll"]);

/** `user` gets test emails and is logged as the moderator; deleting everything needs `confirm` typed back. */
export const runAction = async (cs: c.CommentSite, action: string, body: any, user: { email: string; confirm: string }) => {
  const key = cs.key;
  const id = String(body.id ?? "");
  switch (action) {
    case "stats":
      return c.stats(key);
    case "list":
      return c.listComments(key, body);
    case "pages":
      return c.listPages(key);
    case "log":
      return c.moderationLog(key, id);
    case "moderate":
      return c.moderate(key, Array.isArray(body.ids) ? body.ids : [id], body.status, user.email);
    case "edit":
      return c.adminEdit(key, id, body.body);
    case "deletePage":
      return c.deletePage(key, id);
    case "users":
      return c.listCommenters(key, body);
    case "userComments":
      return c.commenterComments(key, id);
    case "ban":
    case "unban":
      return c.ban(key, id, action === "ban");
    case "deleteAllByUser":
      return c.deleteAllBy(key, id, user.email);
    case "setNotifications":
      return c.adminSetNotifications(key, id, !!body.enabled);
    case "settings":
      return c.publicSettings(cs);
    case "saveSettings":
      return c.publicSettings(c.saveSettings(cs, body.settings ?? {}));
    case "emailPreview":
      return { html: c.emailPreview(body.settings ? { ...cs, ...pickBranding(body.settings) } : cs, ["new-comment", "reply", "like"].includes(body.type) ? body.type : "new-comment") };
    case "testEmail":
      await c.sendTestEmail(cs, user.email);
      return { to: user.email };
    case "export":
      return c.exportData(key);
    case "deleteAll":
      if (body.confirm !== user.confirm) throw new HttpError(`Type ${user.confirm} to confirm.`, 400);
      return c.deleteAllData(key);
    default:
      throw new HttpError("Unknown action.", 400);
  }
};

// The live preview in Settings uses the form's unsaved branding.
const pickBranding = (s: any) => ({
  accentColor: typeof s.accentColor === "string" && /^#[0-9a-f]{6}$/i.test(s.accentColor) ? s.accentColor : null,
  logoUrl: typeof s.logoUrl === "string" && /^https:\/\//i.test(s.logoUrl) ? s.logoUrl : null,
  footerText: typeof s.footerText === "string" && s.footerText.trim() ? s.footerText.slice(0, 300) : null,
});
