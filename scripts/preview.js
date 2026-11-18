// Renders the panel outside VS Code with stats from a real repository (default: this one,
// or pass a path), and saves screenshots plus the share PNG to images/.
//   node scripts/preview.js [repoPath] [year]
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { readYear, userEmail } = require("../src/gitlog");
const { compute } = require("../src/stats");

const root = path.join(__dirname, "..");
const OUT = path.join(root, "images");
fs.mkdirSync(OUT, { recursive: true });

async function statsFor(repo, year) {
  const email = await userEmail(repo);
  const commits = await readYear(repo, year, path.basename(repo));
  const prev = await readYear(repo, year - 1, path.basename(repo));
  const s = compute(commits, { year, previousYearCommits: prev.length });
  return Object.assign(s, { onlyMe: false, emails: [email], repoCount: 1 });
}

function fakeStats(year) {
  // A believable year for marketplace screenshots, built from synthetic commits.
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
}

(async () => {
  const repoArg = process.argv[2];
  const year = Number(process.argv[3]) || new Date().getFullYear();
  const stats = repoArg ? await statsFor(path.resolve(repoArg), year) : fakeStats(year);

  const css = fs.readFileSync(path.join(root, "media", "panel.css"), "utf8");
  const js = fs.readFileSync(path.join(root, "media", "panel.js"), "utf8");
  const browser = await chromium.launch();
  for (const theme of ["dark", "light"]) {
    const vars = theme === "dark"
      ? "--vscode-foreground:#cccccc;--vscode-editor-background:#1f1f1f;--vscode-descriptionForeground:#9d9d9d;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff"
      : "--vscode-foreground:#3b3b3b;--vscode-editor-background:#ffffff;--vscode-descriptionForeground:#717171;--vscode-button-background:#005fb8;--vscode-button-foreground:#fff";
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
    await page.setContent(`<html style="${vars}"><head><style>${css}</style></head><body><div id="app"></div><script>${js}</script></body></html>`);
    await page.evaluate(({ stats, year }) => window.__yearInCode.render(stats, [year, year - 1]), { stats, year });
    await page.screenshot({ path: path.join(OUT, `panel-${theme}.png`), fullPage: true });
    if (theme === "dark") {
      const dataUrl = await page.evaluate((stats) => window.__yearInCode.shareCard(stats), stats);
      fs.writeFileSync(path.join(OUT, "share-card.png"), Buffer.from(dataUrl.split(",")[1], "base64"));
      await page.screenshot({ path: path.join(OUT, "panel-top.png"), clip: { x: 0, y: 0, width: 1100, height: 760 } });
    }
    await page.close();
  }
  await browser.close();
  console.log(`commits=${stats.commits} persona=${stats.persona && stats.persona.name} -> images/`);
})();
