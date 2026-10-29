import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { runInNewContext } from "node:vm";

const workerSource = await readFile(new URL("../worker.js", import.meta.url), "utf8");
const helpersStart = workerSource.indexOf("const RESERVED =");
const helpersEnd = workerSource.indexOf("const gh = (env, path, init = {}) =>", helpersStart);
const safeEqualStart = workerSource.indexOf("const safeEqual =", helpersEnd);
const safeEqualEnd = workerSource.indexOf("const DUMMY_SALT =", safeEqualStart);

assert.ok(
  helpersStart >= 0 && helpersEnd > helpersStart,
  "Worker validation helpers must be discoverable",
);
assert.ok(
  safeEqualStart >= 0 && safeEqualEnd > safeEqualStart,
  "Worker comparison helper must be discoverable",
);

const validationSandbox = { atob: globalThis.atob };
const validationSource = `${workerSource.slice(helpersStart, helpersEnd)}
${workerSource.slice(safeEqualStart, safeEqualEnd)}
globalThis.__helpers = {
  isValidAvatarDataUrl,
  isValidISODate,
  isValidPublicationFile,
  isValidTime,
  okEntry,
  okHtml,
  okSlug,
  okText,
  safeEqual,
};`;

runInNewContext(validationSource, validationSandbox, { filename: "worker-validation-helpers.js" });

const {
  isValidAvatarDataUrl,
  isValidISODate,
  isValidPublicationFile,
  isValidTime,
  okEntry,
  okHtml,
  okSlug,
  okText,
  safeEqual,
} = validationSandbox.__helpers;

const toBase64 = (bytes) => Buffer.from(bytes).toString("base64");

test("slug validation accepts only safe publication slugs", () => {
  assert.equal(okSlug("open-house-2026"), true);
  assert.equal(okSlug("panel"), false);
  assert.equal(okSlug("../private"), false);
  assert.equal(okSlug("Uppercase"), false);
  assert.equal(okSlug("a".repeat(61)), false);
});

test("text and event-card validation reject markup and invalid paths", () => {
  assert.equal(okText("Texte éditorial"), true);
  assert.equal(okText(undefined), true);
  assert.equal(okText("<script>alert(1)</script>"), false);
  assert.equal(okText("x".repeat(300)), false);

  assert.equal(
    okEntry({
      status: "live",
      href: "open-house/",
      icon: "calendar",
      title: "Open House",
      desc: "Desc",
      date: "2026-10-29",
    }),
    true,
  );
  assert.equal(
    okEntry({
      status: "live",
      href: "../secret/",
      icon: "calendar",
      title: "Title",
      desc: "Desc",
      date: "2026-10-29",
    }),
    false,
  );
});

test("HTML publication guard rejects script-capable markup", () => {
  assert.equal(okHtml('<div class="page"><p>Contenu MRD</p></div>'), true);
  assert.equal(okHtml("<script>alert(1)</script>"), false);
  assert.equal(okHtml("<img src=x onerror=alert(1)>"), false);
  assert.equal(okHtml('<a href="javascript:alert(1)">ouvrir</a>'), false);
  assert.equal(okHtml('<img src="jav&#x61;script:alert(1)">'), false);
});

test("date and time validators enforce calendar values and 24-hour time", () => {
  assert.equal(isValidISODate("2024-02-29"), true);
  assert.equal(isValidISODate("2025-02-29"), false);
  assert.equal(isValidISODate("2026-13-01"), false);
  assert.equal(isValidISODate("29/10/2026"), false);
  assert.equal(isValidTime("00:00"), true);
  assert.equal(isValidTime("23:59"), true);
  assert.equal(isValidTime("24:00"), false);
  assert.equal(isValidTime("12:60"), false);
});

test("publication file validation checks signatures, encoding and size", () => {
  const pdf = toBase64(Buffer.from("%PDF-1.7\nMRD test document\n"));
  const png = toBase64([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const jpeg = toBase64([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
  const webp = toBase64([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const gif = toBase64(Buffer.from("GIF89a"));

  assert.equal(isValidPublicationFile("application/pdf", pdf), true);
  assert.equal(isValidPublicationFile("image/png", png), true);
  assert.equal(isValidPublicationFile("image/jpeg", jpeg), true);
  assert.equal(isValidPublicationFile("image/webp", webp), true);
  assert.equal(isValidPublicationFile("image/gif", gif), true);

  assert.equal(isValidPublicationFile("image/png", pdf), false);
  assert.equal(isValidPublicationFile("application/pdf", "not-base64!"), false);
  assert.equal(isValidPublicationFile("application/pdf", pdf, 4), false);
  assert.equal(isValidPublicationFile("image/svg+xml", png), false);
});

test("avatar data URLs enforce MIME signature and payload size", () => {
  const png = toBase64([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  const jpeg = toBase64([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

  assert.equal(isValidAvatarDataUrl(`data:image/png;base64,${png}`), true);
  assert.equal(isValidAvatarDataUrl(`data:image/jpeg;base64,${jpeg}`), true);
  assert.equal(isValidAvatarDataUrl(`data:image/png;base64,${jpeg}`), false);
  assert.equal(isValidAvatarDataUrl("data:image/svg+xml;base64,PHN2Zz4="), false);

  const oversized = toBase64(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(300 * 1024)]),
  );
  assert.equal(isValidAvatarDataUrl(`data:image/png;base64,${oversized}`), false);
});

test("constant-time comparison helper returns the expected equality result", () => {
  assert.equal(safeEqual("token-a", "token-a"), true);
  assert.equal(safeEqual("token-a", "token-b"), false);
  assert.equal(safeEqual("short", "longer"), false);
});

test("panel API client reads the same sessionStorage key used during sign-in", async () => {
  const source = await readFile(new URL("../../panel/js/editor-model.js", import.meta.url), "utf8");

  assert.match(source, /const token = sessionStorage\.getItem\(KEY\.token\);/);
  assert.doesNotMatch(source, /const token = localStorage\.getItem\(KEY\.token\);/);
});

test("the Division organigram keeps its board and chart wrappers after text simplification", async () => {
  const source = await readFile(new URL("../../panel/js/workspace.js", import.meta.url), "utf8");
  const rosterStart = source.indexOf("function renderWsRoster()");
  const rosterEnd = source.indexOf("let wsCalendarMonth", rosterStart);
  const roster = source.slice(rosterStart, rosterEnd);
  const returnedMarkup = roster.slice(roster.lastIndexOf("  return ("));

  assert.ok(rosterStart >= 0 && rosterEnd > rosterStart);
  assert.ok(returnedMarkup.includes('<section class="ws-org-board"><div class="ws-org-chart">'));
  assert.ok(returnedMarkup.includes("tiers +"));
  assert.ok(returnedMarkup.includes('</div><div class="ws-org-board-foot">'));
  assert.ok(source.includes("Organigramme - Chaîne de commandement"));
  assert.ok(!source.includes("Effectif de la division</small>"));
  assert.ok(!source.includes("Événements planifiés</small>"));
  assert.ok(!source.includes("À suivre cette semaine</small>"));
});

test("saving a member profile reloads a valid workspace section instead of leaving the content blank", async () => {
  const source = await readFile(new URL("../../panel/js/workspace.js", import.meta.url), "utf8");

  assert.match(
    source,
    /wsSection = \['home', 'calendar', 'tasks'\]\.includes\(section\) \? section : 'home';/,
  );

  const rosterStart = source.indexOf("if (f.matches('.ws-roster-form'))");
  const rosterEnd = source.indexOf("if (f.id === 'ws-event-form')", rosterStart);
  const rosterSubmit = source.slice(rosterStart, rosterEnd);

  assert.ok(rosterStart >= 0 && rosterEnd > rosterStart);
  assert.match(rosterSubmit, /await wsReload\('home'\);/);
  assert.doesNotMatch(rosterSubmit, /await wsReload\('roster'\);/);
});
