// Downloads VS Code, opens a temporary git repository in it, and runs test/vscode/suite.js inside.
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const { runTests } = require("@vscode/test-electron");

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "yic-vscode-"));
  const g = (args, env = {}) => execFileSync("git", args, { cwd: dir, env: { ...process.env, ...env }, stdio: "pipe" });
  g(["init", "-q", "-b", "main"]);
  g(["config", "user.email", "me@example.com"]);
  g(["config", "user.name", "Me"]);
  const year = new Date().getFullYear();
  const commit = (file, text, msg, date, email = "me@example.com") => {
    fs.writeFileSync(path.join(dir, file), text);
    g(["add", "-A"]);
    g(["-c", `user.email=${email}`, "commit", "-q", "-m", msg], { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  };
  commit("main.go", "package main\n", "Start", `${year}-02-01T22:00:00+03:00`);
  commit("main.go", "package main\nfunc main(){}\n", "Add main", `${year}-02-02T23:00:00+03:00`);
  commit("util.go", "package main\n", "Fix util bug", `${year}-02-03T23:30:00+03:00`);
  commit("other.txt", "x\n", "Someone else's commit", `${year}-03-01T10:00:00+03:00`, "other@example.com");
  return dir;
}

(async () => {
  try {
    const workspace = makeRepo();
    await runTests({
      extensionDevelopmentPath: path.join(__dirname, "..", ".."),
      extensionTestsPath: path.join(__dirname, "suite.js"),
      launchArgs: [workspace, "--disable-extensions", "--disable-workspace-trust"],
    });
    console.log("VS Code tests passed");
  } catch (e) {
    console.error("VS Code tests failed:", e);
    process.exit(1);
  }
})();
