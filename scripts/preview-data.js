// A believable synthetic year for screenshots and the demo GIF.
module.exports = function fakeStats(compute, year) {
  const commits = [];
  const subjects = ["Add search endpoint", "Fix login redirect bug", "Refactor parser", "Update dashboard charts",
    "Fix flaky test", "Add dark mode", "Improve cache hit rate", "Add parser benchmarks", "Fix memory leak in worker",
    "Ship onboarding flow", "Add API rate limiting", "Docs: getting started", "Parser: handle unicode"];
  const files = [["src/server/api.ts", "TypeScript"], ["src/web/App.tsx", "TypeScript"], ["src/parser/core.rs", "Rust"],
    ["scripts/deploy.py", "Python"], ["src/web/styles.css", "CSS"], ["README.md", "Markdown"], ["src/db/schema.sql", "SQL"]];
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const monthWeight = [6, 8, 11, 9, 7, 5, 4, 6, 10, 13, 12, 9];
  for (let m = 1; m <= 12; m++) {
    for (let d = 1; d <= 28; d++) {
      if (rnd() * 14 > monthWeight[m - 1]) continue;
      const n = 1 + Math.floor(rnd() * 4);
      for (let k = 0; k < n; k++) {
        const hour = rnd() < 0.55 ? 21 + Math.floor(rnd() * 4) % 24 : 9 + Math.floor(rnd() * 10);
        const date = `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const fs1 = files[Math.floor(rnd() * files.length)];
        const fs2 = files[Math.floor(rnd() * 3)];
        commits.push({ hash: `${date}${k}`, repo: "", email: "me", subject: subjects[Math.floor(rnd() * subjects.length)],
          date, year, month: m, hour: hour % 24, weekday: new Date(Date.UTC(year, m - 1, d)).getUTCDay(),
          files: [{ path: fs1[0], added: Math.floor(rnd() * 120), deleted: Math.floor(rnd() * 40) },
            { path: fs2[0], added: Math.floor(rnd() * 60), deleted: Math.floor(rnd() * 30) }] });
      }
    }
  }
  const s = compute(commits, { year, previousYearCommits: Math.round(commits.length * 0.78) });
  return Object.assign(s, { onlyMe: true, emails: ["me"], repoCount: 1 });
};
