const vscode = require("vscode");
const path = require("path");
const { readYear, years, isRepo, userEmail } = require("./gitlog");
const { compute } = require("./stats");

let panel = null;
const api = { lastStats: null }; // returned from activate(); used by tests

async function workspaceRepos() {
  const folders = vscode.workspace.workspaceFolders || [];
  const repos = [];
  for (const f of folders) {
    if (f.uri.scheme === "file" && (await isRepo(f.uri.fsPath))) {
      repos.push({ name: f.name, dir: f.uri.fsPath });
    }
  }
  return repos;
}

async function myEmails(repos) {
  const extra = vscode.workspace.getConfiguration("yearInCode").get("authorEmails") || [];
  const set = new Set(extra.map((e) => String(e).toLowerCase().trim()).filter(Boolean));
  for (const r of repos) {
    const e = await userEmail(r.dir);
    if (e) set.add(e);
  }
  return set;
}

async function build(repos, year, onlyMe) {
  const emails = await myEmails(repos);
  const mine = (c) => !onlyMe || emails.size === 0 || emails.has(c.email);
  let commits = [];
  let previous = 0;
  for (const r of repos) {
    commits = commits.concat((await readYear(r.dir, year, r.name)).filter(mine));
    previous += (await readYear(r.dir, year - 1, r.name)).filter(mine).length;
  }
  const stats = compute(commits, { year, previousYearCommits: previous });
  stats.onlyMe = onlyMe;
  stats.emails = [...emails];
  stats.repoCount = repos.length;
  return stats;
}

async function availableYears(repos) {
  const set = new Set();
  for (const r of repos) for (const y of await years(r.dir)) set.add(y);
  const list = [...set].sort((a, b) => b - a);
  return list.length ? list : [new Date().getFullYear()];
}

function nonce() {
  let s = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

function html(webview, extUri) {
  const media = (f) => webview.asWebviewUri(vscode.Uri.joinPath(extUri, "media", f));
  const n = nonce();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${n}'; font-src ${webview.cspSource};">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${media("panel.css")}">
<title>Year in Code</title></head>
<body><div id="app"><p class="loading">Reading your git history…</p></div>
<script nonce="${n}" src="${media("panel.js")}"></script></body></html>`;
}

async function show(context) {
  const repos = await workspaceRepos();
  if (!repos.length) {
    vscode.window.showInformationMessage("Year in Code: open a folder that is a git repository first.");
    return;
  }
  state.repos = repos;
  state.years = await availableYears(repos);
  const now = new Date();
  // In January, last year's recap is the interesting one.
  state.year = now.getMonth() === 0 && state.years.includes(now.getFullYear() - 1) ? now.getFullYear() - 1 : state.years[0];

  if (panel) {
    panel.reveal();
    return render();
  }
  panel = vscode.window.createWebviewPanel("yearInCode", "Year in Code", vscode.ViewColumn.Active, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
  });
  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
  panel.onDidDispose(() => (panel = null));
  panel.webview.onDidReceiveMessage(onMessage);
  // The page sends "ready" once loaded, which triggers the first render.
  panel.webview.html = html(panel.webview, context.extensionUri);
}

const state = { repos: [], years: [], year: new Date().getFullYear(), onlyMe: true };

async function render() {
  const target = panel;
  if (!target) return;
  try {
    const stats = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: "Year in Code: reading git history" },
      () => build(state.repos, state.year, state.onlyMe)
    );
    api.lastStats = stats;
    target.webview.postMessage({ type: "stats", stats, years: state.years });
  } catch (e) {
    target.webview.postMessage({ type: "error", message: String(e.message || e) });
  }
}

async function onMessage(msg) {
  if (msg.type === "ready") return render();
  if (msg.type === "setYear") { state.year = Number(msg.year); return render(); }
  if (msg.type === "setOnlyMe") { state.onlyMe = !!msg.value; return render(); }
  if (msg.type === "savePng") {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(require("os").homedir(), `year-in-code-${state.year}.png`)),
      filters: { Image: ["png"] },
    });
    if (!uri) return;
    const data = Buffer.from(String(msg.dataUrl).split(",")[1], "base64");
    await vscode.workspace.fs.writeFile(uri, data);
    const open = await vscode.window.showInformationMessage(`Saved ${path.basename(uri.fsPath)}`, "Open");
    if (open) vscode.env.openExternal(uri);
  }
  if (msg.type === "open" && /^https:\/\//.test(msg.url)) vscode.env.openExternal(vscode.Uri.parse(msg.url));
}

function activate(context) {
  context.subscriptions.push(vscode.commands.registerCommand("yearInCode.show", () => show(context)));
  return api;
}

function deactivate() {}

module.exports = { activate, deactivate, build };
