import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { isOriginAllowed, mentionsOf, normalizeOrigin, originOf, rateLimit, sanitizeBody, uniqueUsername } from "./rules.ts";
import { EMAIL_DEFAULTS, newCommentEmail, replyEmail } from "./mail.ts";
import { buildMessage, sendSmtp } from "../../../lib/smtp.ts";

test("sanitizeBody strips tags and javascript:, trims, caps the length", () => {
  assert.equal(sanitizeBody("  <b>hi</b> <script>x</script> javascript:alert(1) "), "hi x alert(1)");
  assert.equal(sanitizeBody("a".repeat(6000)).length, 5000);
});

test("mentionsOf finds unique handles", () => {
  assert.deepEqual(mentionsOf("@sam and @lena2, again @sam"), ["sam", "lena2"]);
});

test("isOriginAllowed: domain, list, wildcards, localhost in dev, open when unset", () => {
  assert.equal(normalizeOrigin("Example.com/"), "https://example.com");
  assert.equal(isOriginAllowed("https://example.com", [], "example.com"), true);
  assert.equal(isOriginAllowed("https://evil.com", [], "example.com"), false);
  assert.equal(isOriginAllowed("https://evil.com", [], ""), true);
  assert.equal(isOriginAllowed(null, [], ""), false);
  assert.equal(isOriginAllowed("https://a.b.example.com", ["*.example.com"], "example.com"), true);
  assert.equal(isOriginAllowed("http://blog.example.com", ["*.example.com"], ""), true);
  assert.equal(isOriginAllowed("http://blog.example.com", ["https://*.example.com"], ""), false);
  assert.equal(isOriginAllowed("https://example.com.evil.com", ["*.example.com"], ""), false);
  assert.equal(isOriginAllowed("https://xexample.com", ["*.example.com"], ""), false);
  assert.equal(isOriginAllowed("https://any.dev", ["*"], "example.com"), true);
  assert.equal(isOriginAllowed("http://localhost:4321", [], "example.com", true), true);
  assert.equal(isOriginAllowed("http://localhost:4321", [], "example.com", false), false);
});

test("originOf prefers Origin, falls back to the Referer", () => {
  assert.equal(originOf(new Headers({ origin: "https://a.com" })), "https://a.com");
  assert.equal(originOf(new Headers({ origin: "null", referer: "https://b.com/post?x" })), "https://b.com");
  assert.equal(originOf(new Headers()), null);
});

test("rateLimit allows `limit` hits per window", () => {
  const ok = [1, 2, 3].map(() => rateLimit("t", 2, 1000, 0));
  assert.deepEqual(ok, [true, true, false]);
  assert.equal(rateLimit("t", 2, 1000, 2000), true);
});

test("uniqueUsername: first name, letters and digits, numbered when taken", () => {
  assert.equal(uniqueUsername("Sam Rivera", () => false), "sam");
  assert.equal(uniqueUsername("Şule Kaya", () => false), "ule");
  assert.equal(uniqueUsername("!!!", () => false), "user");
  const taken = new Set(["sam", "sam2"]);
  assert.equal(uniqueUsername("Sam", (u) => taken.has(u)), "sam3");
});

test("emails escape user text and drop non-http links", () => {
  const b = { ...EMAIL_DEFAULTS, logoUrl: "javascript:alert(1)", siteUrl: null };
  const html = newCommentEmail(b, { commenterName: "<img src=x onerror=1>", pageTitle: '"t"', commentBody: "<b>hi</b>", viewUrl: "javascript:x" });
  assert.ok(!html.includes("<img src=x"));
  assert.ok(html.includes("&#60;b&#62;hi&#60;/b&#62;"));
  assert.ok(!html.includes("javascript:"));
  assert.ok(replyEmail(b, { replierName: "a", pageTitle: "p", originalBody: "o", replyBody: "r", viewUrl: "https://x.com/#c", unsubscribeUrl: "https://cms/u?token=1" }).includes("Unsubscribe"));
});

test("buildMessage encodes headers and rejects header injection", () => {
  const msg = buildMessage({ from: "a@x.com", fromName: "Çağ", to: "b@y.com", subject: "Hi\r\nBcc: evil", html: "<p>ü</p>" });
  assert.match(msg, /^From: =\?UTF-8\?B\?/);
  assert.match(msg, /Subject: Hi Bcc: evil\r\n/);
  assert.throws(() => buildMessage({ from: "a@x.com", to: "b@y.com>\r\nRCPT TO:<c@z.com", subject: "s", html: "" }));
});

test("sendSmtp speaks SMTP with AUTH LOGIN to a plain server", async () => {
  const seen: string[] = [];
  const server = net.createServer((s) => {
    s.write("220 hi\r\n");
    let data = false;
    let buf = "";
    s.on("data", (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (data) {
          if (line === ".") (data = false), s.write("250 queued\r\n");
          continue;
        }
        seen.push(line.split(" ")[0]);
        const auth = seen.lastIndexOf("AUTH");
        if (line.startsWith("EHLO")) s.write("250-hi\r\n250 AUTH LOGIN\r\n");
        else if (line === "AUTH LOGIN" || seen.length - 1 === auth + 1) s.write("334 x\r\n");
        else if (auth >= 0 && seen.length - 1 === auth + 2) s.write("235 ok\r\n");
        else if (line === "DATA") (data = true), s.write("354 go\r\n");
        else if (line === "QUIT") s.end("221 bye\r\n");
        else s.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  await sendSmtp({ host: "127.0.0.1", port, user: "u", pass: "p" }, { from: "a@x.com", to: "b@y.com", subject: "s", html: "<p>x</p>" });
  server.close();
  assert.deepEqual(seen.slice(0, 2), ["EHLO", "AUTH"]);
  assert.ok(seen.includes("MAIL") && seen.includes("RCPT") && seen.includes("DATA"));
});
