// Reads commits from a git repository and parses `git log --numstat` output.
// The parser is pure so it can be tested without git.
const { execFile } = require("child_process");

const RS = "\x1e"; // record separator: start of each commit
const US = "\x1f"; // unit separator: between fields

const FORMAT = `${RS}%H${US}%aI${US}%ae${US}%an${US}%s`;

/**
 * Turns `git log --numstat --pretty=format:FORMAT` output into commits.
 * Dates keep the author's own clock: "2026-03-10T23:15:02+03:00" -> date "2026-03-10", hour 23.
 */
function parseLog(text, repo = "") {
  const commits = [];
  for (const chunk of text.split(RS)) {
    if (!chunk.trim()) continue;
    const nl = chunk.indexOf("\n");
    const header = nl === -1 ? chunk : chunk.slice(0, nl);
    const body = nl === -1 ? "" : chunk.slice(nl + 1);
    const [hash, iso, email, name, subject = ""] = header.split(US);
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || "");
    if (!hash || !m) continue;
    const files = [];
    for (const line of body.split("\n")) {
      const parts = line.split("\t");
      if (parts.length < 3) continue;
      const [a, d] = parts;
      const path = renamedPath(parts.slice(2).join("\t"));
      files.push({
        path,
        added: a === "-" ? 0 : Number(a) || 0,
        deleted: d === "-" ? 0 : Number(d) || 0,
        binary: a === "-",
      });
    }
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    commits.push({
      hash,
      repo,
      email: (email || "").toLowerCase(),
      name: name || "",
      subject,
      date: `${m[1]}-${m[2]}-${m[3]}`,
      year,
      month,
      hour: Number(m[4]),
      // Weekday of the author's local calendar date (0 = Sunday).
      weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
      files,
    });
  }
  return commits;
}

// "src/{old => new}/a.js" -> "src/new/a.js", "old.js => new.js" -> "new.js"
function renamedPath(p) {
  if (!p.includes("=>")) return p;
  const brace = /\{([^}]*) => ([^}]*)\}/;
  if (brace.test(p)) return p.replace(brace, "$2").replace(/\/\//g, "/");
  return p.split(" => ").pop();
}

function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 512 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout);
    });
  });
}

async function isRepo(cwd) {
  try {
    return (await git(cwd, ["rev-parse", "--is-inside-work-tree"])).trim() === "true";
  } catch {
    return false;
  }
}

async function userEmail(cwd) {
  try {
    return (await git(cwd, ["config", "user.email"])).trim().toLowerCase();
  } catch {
    return "";
  }
}

/** Commits authored in `year` (author's local time), across all branches, no merges. */
async function readYear(cwd, year, repoName = "") {
  // Pad the window by a day each side for time zones, then filter on the author date.
  const out = await git(cwd, [
    "-c", "core.quotepath=off",
    "log", "--all", "--no-merges", "--numstat", "--date=iso-strict",
    `--since=${year - 1}-12-31`, `--until=${year + 1}-01-02`,
    `--pretty=format:${FORMAT}`,
  ]);
  return parseLog(out, repoName).filter((c) => c.year === year);
}

/** Years that have commits, newest first. */
async function years(cwd) {
  const out = await git(cwd, ["log", "--all", "--no-merges", "--pretty=format:%aI"]);
  const set = new Set();
  for (const line of out.split("\n")) {
    const y = Number(line.slice(0, 4));
    if (y) set.add(y);
  }
  return [...set].sort((a, b) => b - a);
}

module.exports = { parseLog, renamedPath, readYear, years, isRepo, userEmail, FORMAT, git };
