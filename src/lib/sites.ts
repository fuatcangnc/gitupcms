// Sites are stored like WuppyCMS's (owner + repo); here the owner is always "gitupcms" and the repo is the site's name.
export const OWNER = "gitupcms";
export const slug = (name: unknown) =>
  String(name ?? "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
