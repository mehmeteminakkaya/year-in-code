// Runs inside VS Code's extension host.
const assert = require("assert");
const vscode = require("vscode");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await wait(200);
  }
  return null;
}

async function run() {
  const ext = vscode.extensions.getExtension("mehmeteminakkaya.year-in-code");
  assert.ok(ext, "extension is installed");

  assert.ok(!ext.isActive, "lazy: not active before the command runs");
  // Running the contributed command activates the extension on demand.
  await vscode.commands.executeCommand("yearInCode.show");
  const api = await waitFor(() => ext.isActive && ext.exports);
  assert.ok(api, "extension activated");
  const cmds = await vscode.commands.getCommands(true);
  assert.ok(cmds.includes("yearInCode.show"), "command registered");

  // The webview loads, posts "ready", and the extension computes stats.
  const stats = await waitFor(() => api.lastStats);
  assert.ok(stats, "stats computed after the webview loaded (webview script ran)");
  assert.strictEqual(stats.year, new Date().getFullYear());
  assert.strictEqual(stats.commits, 3, "only my 3 commits, not the other author's");
  assert.strictEqual(stats.streak.days, 3);
  assert.strictEqual(stats.persona.key, "night_owl");
  assert.strictEqual(stats.languages[0].name, "Go");
  assert.strictEqual(stats.fixes, 1);

  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs).map((t) => t.label);
  assert.ok(tabs.includes("Year in Code"), "panel tab is open: " + tabs.join(", "));

  // Running the command again reuses the panel and recomputes.
  api.lastStats = null;
  await vscode.commands.executeCommand("yearInCode.show");
  assert.ok(await waitFor(() => api.lastStats), "recomputed on second run");
  const count = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((t) => t.label === "Year in Code").length;
  assert.strictEqual(count, 1, "still one panel");

  // All authors.
  await vscode.workspace.getConfiguration("yearInCode").update("authorEmails", ["other@example.com"], vscode.ConfigurationTarget.Global);
  api.lastStats = null;
  await vscode.commands.executeCommand("yearInCode.show");
  const both = await waitFor(() => api.lastStats);
  assert.strictEqual(both.commits, 4, "extra email from settings is counted as me");
}

module.exports = { run };
