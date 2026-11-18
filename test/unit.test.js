const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseLog, renamedPath, readYear, years, userEmail } = require("../src/gitlog");
const { compute, language } = require("../src/stats");

const RS = "\x1e", US = "\x1f";
const rec = (hash, iso, subject, files = []) =>
  `${RS}${hash}${US}${iso}${US}Me@Example.com${US}Me${US}${subject}\n` + files.map((f) => f.join("\t")).join("\n");

test("parseLog reads fields, local time and numstat", () => {
  const text =
    rec("a1", "2026-03-10T23:15:02+03:00", "Add parser", [["10", "2", "src/a.js"], ["-", "-", "img.png"]]) +
    "\n" +
    rec("b2", "2026-03-11T00:05:00-05:00", "Fix: crash", [["1", "1", "src/{old => new}/b.ts"]]);
  const cs = parseLog(text, "repo");
  assert.equal(cs.length, 2);
  assert.equal(cs[0].hour, 23, "author's own clock, not UTC");
  assert.equal(cs[0].date, "2026-03-10");
  assert.equal(cs[0].weekday, 2, "2026-03-10 is a Tuesday");
  assert.equal(cs[0].email, "me@example.com");
  assert.deepEqual(cs[0].files[1], { path: "img.png", added: 0, deleted: 0, binary: true });
  assert.equal(cs[1].files[0].path, "src/new/b.ts");
  assert.equal(cs[1].repo, "repo");
});

test("renamedPath", () => {
  assert.equal(renamedPath("a.js => b.js"), "b.js");
  assert.equal(renamedPath("src/{a => b}/x.js"), "src/b/x.js");
  assert.equal(renamedPath("src/{ => lib}/x.js"), "src/lib/x.js");
  assert.equal(renamedPath("src/x.js"), "src/x.js");
});

test("language", () => {
  assert.equal(language("src/App.TSX"), "TypeScript");
  assert.equal(language("Dockerfile"), "Dockerfile");
  assert.equal(language(".gitignore"), null);
  assert.equal(language("README"), null);
});

test("compute: streak, persona, languages, lock files ignored", () => {
  const mk = (date, hour, subject, files) => {
    const [y, m, d] = date.split("-").map(Number);
    return { hash: date + hour, repo: "r", email: "me", subject, date, year: y, month: m, hour,
      weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay(), files };
  };
  const cs = [
    mk("2026-01-05", 23, "Start project", [{ path: "a.py", added: 100, deleted: 0 }]),
    mk("2026-01-06", 23, "Fix bug in parser", [{ path: "a.py", added: 5, deleted: 5 }]),
    mk("2026-01-07", 1, "parser speedup", [{ path: "b.ts", added: 20, deleted: 0 }]),
    mk("2026-01-07", 23, "docs", [{ path: "README.md", added: 3, deleted: 0 }, { path: "package-lock.json", added: 5000, deleted: 0 }]),
    mk("2026-06-01", 10, "parser rewrite", [{ path: "a.py", added: 300, deleted: 200 }]),
  ];
  const s = compute(cs, { year: 2026, previousYearCommits: 2 });
  assert.equal(s.commits, 5);
  assert.equal(s.added, 428, "lock file excluded");
  assert.equal(s.deleted, 205);
  assert.equal(s.activeDays, 4);
  assert.deepEqual(s.streak, { days: 3, from: "2026-01-05", to: "2026-01-07" });
  assert.deepEqual(s.busiestDay, { date: "2026-01-07", commits: 2 });
  assert.equal(s.persona.key, "night_owl");
  assert.equal(s.topMonth, "January");
  assert.equal(s.languages[0].name, "Python");
  assert.equal(s.biggestCommit.subject, "parser rewrite");
  assert.equal(s.firstCommit.subject, "Start project");
  assert.equal(s.lastCommit.subject, "parser rewrite");
  assert.equal(s.fixes, 1);
  assert.equal(s.topWords[0].word, "parser");
  assert.equal(s.topFiles[0].path, "r/a.py");
});

test("compute: empty year", () => {
  const s = compute([], { year: 2020 });
  assert.equal(s.empty, true);
});

test("readYear on a real git repository", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yic-"));
  const g = (args, env = {}) => execFileSync("git", args, { cwd: dir, env: { ...process.env, ...env }, stdio: "pipe" }).toString();
  g(["init", "-q", "-b", "main"]);
  g(["config", "user.email", "Dev@Example.com"]);
  g(["config", "user.name", "Dev"]);
  const commit = (file, content, msg, date) => {
    fs.writeFileSync(path.join(dir, file), content);
    g(["add", "-A"]);
    g(["commit", "-q", "-m", msg], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  };
  commit("old.js", "x\n", "last year", "2025-12-31T23:30:00+00:00");
  commit("app.js", "a\nb\nc\n", "first of the year", "2026-01-01T00:30:00+03:00");
  commit("app.js", "a\nb\nc\nd\n", "second", "2026-01-02T22:00:00+03:00");
  fs.mkdirSync(path.join(dir, "src"));
  commit("src/ünïcödé.py", "print(1)\n", "unicode path", "2026-02-02T10:00:00+03:00");
  return (async () => {
    const cs = await readYear(dir, 2026, "demo");
    assert.equal(cs.length, 3);
    assert.ok(cs.every((c) => c.year === 2026));
    assert.ok(cs.some((c) => c.files.some((f) => f.path === "src/ünïcödé.py")), "unicode path unquoted");
    assert.deepEqual(await years(dir), [2026, 2025]);
    assert.equal(await userEmail(dir), "dev@example.com");
    const s = compute(cs, { year: 2026 });
    assert.equal(s.added, 5);
    assert.deepEqual(s.streak, { days: 2, from: "2026-01-01", to: "2026-01-02" });
  })();
});
