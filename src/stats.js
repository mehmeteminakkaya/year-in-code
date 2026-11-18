// Turns a list of parsed commits into the numbers the recap shows. Pure.

const LANGUAGES = {
  js: "JavaScript", mjs: "JavaScript", cjs: "JavaScript", jsx: "JavaScript",
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  py: "Python", ipynb: "Jupyter", rb: "Ruby", php: "PHP", java: "Java", kt: "Kotlin", kts: "Kotlin",
  scala: "Scala", go: "Go", rs: "Rust", c: "C", h: "C", cpp: "C++", cc: "C++", cxx: "C++", hpp: "C++",
  cs: "C#", fs: "F#", swift: "Swift", m: "Objective-C", mm: "Objective-C", dart: "Dart",
  lua: "Lua", r: "R", jl: "Julia", ex: "Elixir", exs: "Elixir", erl: "Erlang", hs: "Haskell",
  clj: "Clojure", ml: "OCaml", zig: "Zig", nim: "Nim", sol: "Solidity",
  html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", sass: "Sass", less: "Less",
  vue: "Vue", svelte: "Svelte", astro: "Astro",
  sh: "Shell", bash: "Shell", zsh: "Shell", ps1: "PowerShell", bat: "Batch",
  sql: "SQL", graphql: "GraphQL", gql: "GraphQL", proto: "Protobuf",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  md: "Markdown", mdx: "Markdown", rst: "reStructuredText", tex: "TeX",
  gd: "GDScript", glsl: "GLSL", hlsl: "HLSL", tf: "Terraform", nix: "Nix",
};
const FILENAMES = { dockerfile: "Dockerfile", makefile: "Makefile", "cmakelists.txt": "CMake" };
// Lock files and generated output would drown out real work.
const IGNORED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|Cargo\.lock|poetry\.lock|composer\.lock|Gemfile\.lock|go\.sum)$|(^|\/)(dist|build|out|vendor|node_modules)\/|\.min\.(js|css)$|\.map$/i;

function language(path) {
  const base = path.split("/").pop().toLowerCase();
  if (FILENAMES[base]) return FILENAMES[base];
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  return LANGUAGES[base.slice(dot + 1)] || null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PERSONAS = [
  { key: "early_bird", name: "Early Bird", blurb: "You shipped before most people had coffee.", from: 5, to: 11 },
  { key: "nine_to_five", name: "Daylight Dev", blurb: "Office hours were your power hours.", from: 12, to: 17 },
  { key: "evening", name: "Evening Hacker", blurb: "Your best work came after dinner.", from: 18, to: 22 },
  { key: "night_owl", name: "Night Owl", blurb: "Most of your commits landed after 11 pm.", from: 23, to: 28 },
];

function dayNumber(date) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function argmax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

const STOP = new Set(("a an the and or of to in on for with from into by at as is are was be it this that " +
  "add adds added update updates updated fix fixes fixed use make change changes changed remove " +
  "removed more some new wip merge branch pull request main master version bump").split(" "));

function compute(commits, { year, previousYearCommits = null } = {}) {
  const s = {
    year,
    commits: commits.length,
    previousYearCommits,
    empty: commits.length === 0,
  };
  if (s.empty) return s;

  const months = Array(12).fill(0);
  const weekdays = Array(7).fill(0);
  const hours = Array(24).fill(0);
  const days = new Map(); // date -> commits
  const langs = new Map(); // language -> lines changed
  const fileCommits = new Map(); // path -> commits
  const repos = new Map();
  const words = new Map();
  let added = 0, deleted = 0, fixes = 0, weekend = 0;
  let biggest = null;

  const when = (c) => c.date + String(c.hour).padStart(2, "0");
  const sorted = [...commits].sort((a, b) => when(a).localeCompare(when(b)));
  for (const c of sorted) {
    months[c.month - 1]++;
    weekdays[c.weekday]++;
    hours[c.hour]++;
    days.set(c.date, (days.get(c.date) || 0) + 1);
    if (c.weekday === 0 || c.weekday === 6) weekend++;
    if (c.repo) repos.set(c.repo, (repos.get(c.repo) || 0) + 1);
    if (/\bfix(e[sd])?\b|\bbug/i.test(c.subject)) fixes++;
    for (const w of c.subject.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || []) {
      if (!STOP.has(w)) words.set(w, (words.get(w) || 0) + 1);
    }

    let lines = 0;
    for (const f of c.files) {
      if (IGNORED.test(f.path)) continue;
      added += f.added;
      deleted += f.deleted;
      lines += f.added + f.deleted;
      const key = c.repo ? `${c.repo}/${f.path}` : f.path;
      fileCommits.set(key, (fileCommits.get(key) || 0) + 1);
      const lang = language(f.path);
      if (lang) langs.set(lang, (langs.get(lang) || 0) + f.added + f.deleted);
    }
    if (!biggest || lines > biggest.lines) biggest = { subject: c.subject, lines, date: c.date, repo: c.repo };
  }

  // Streak and busiest day.
  const dates = [...days.keys()].sort();
  let streak = { days: 0, from: null, to: null };
  let run = 0, runStart = null, prev = null;
  for (const d of dates) {
    const n = dayNumber(d);
    if (prev !== null && n === prev + 1) run++;
    else { run = 1; runStart = d; }
    if (run > streak.days) streak = { days: run, from: runStart, to: d };
    prev = n;
  }
  let busiestDay = { date: null, commits: 0 };
  for (const [d, n] of days) if (n > busiestDay.commits) busiestDay = { date: d, commits: n };

  // Persona from 4 time-of-day buckets.
  let persona = PERSONAS[0], bestCount = -1;
  for (const p of PERSONAS) {
    let sum = 0;
    for (let h = p.from; h <= p.to; h++) sum += hours[h % 24];
    if (sum > bestCount) { bestCount = sum; persona = p; }
  }

  const langTotal = [...langs.values()].reduce((a, b) => a + b, 0) || 1;
  const languages = [...langs.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, lines]) => ({ name, lines, pct: Math.round((lines / langTotal) * 100) }));

  Object.assign(s, {
    added,
    deleted,
    activeDays: days.size,
    months,
    weekdays,
    hours,
    topMonth: MONTHS[argmax(months)],
    topWeekday: WEEKDAYS[argmax(weekdays)],
    topHour: argmax(hours),
    persona: { key: persona.key, name: persona.name, blurb: persona.blurb },
    streak,
    busiestDay,
    languages,
    topFiles: [...fileCommits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([path, n]) => ({ path, commits: n })),
    topWords: [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, n]) => ({ word, n })),
    repos: [...repos.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, commits: n })),
    biggestCommit: biggest,
    firstCommit: { subject: sorted[0].subject, date: sorted[0].date },
    lastCommit: { subject: sorted[sorted.length - 1].subject, date: sorted[sorted.length - 1].date },
    fixes,
    weekendPct: Math.round((weekend / commits.length) * 100),
  });
  return s;
}

module.exports = { compute, language, MONTHS, WEEKDAYS };
