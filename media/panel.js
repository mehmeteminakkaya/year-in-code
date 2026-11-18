// Webview script: renders the recap from the stats the extension posts.
(function () {
  const vscode = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage: () => {} };
  const app = document.getElementById("app");
  let current = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("en-US");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const FULL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const day = (d) => {
    if (!d) return "";
    const [, m, dd] = d.split("-").map(Number);
    return `${FULL_MONTHS[m - 1]} ${dd}`;
  };
  const hour12 = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "am" : "pm"}`;
  const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;

  function controls(stats, years) {
    const opts = years.map((y) => `<option value="${y}" ${y === stats.year ? "selected" : ""}>${y}</option>`).join("");
    return `<div class="controls">
      <label>Year <select id="year">${opts}</select></label>
      <label class="check"><input type="checkbox" id="onlyMe" ${stats.onlyMe ? "checked" : ""}> Only my commits</label>
      <span class="spacer"></span>
      ${stats.empty ? "" : `<button id="save" class="primary">Save as image</button>`}
    </div>`;
  }

  function changeLine(s) {
    if (!s.previousYearCommits) return "";
    const pct = Math.round(((s.commits - s.previousYearCommits) / s.previousYearCommits) * 100);
    if (pct === 0) return `<p class="note">Same as ${s.year - 1}.</p>`;
    return `<p class="note">${Math.abs(pct)}% ${pct > 0 ? "more" : "fewer"} than in ${s.year - 1}.</p>`;
  }

  function bars(values, labels, cls = "") {
    const max = Math.max(1, ...values);
    return `<div class="bars ${cls}">${values.map((v, i) =>
      `<div class="bar" title="${esc(labels[i])}: ${fmt(v)}"><div class="fill" style="height:${Math.round((v / max) * 100)}%"></div><span>${esc(labels[i])}</span></div>`
    ).join("")}</div>`;
  }

  function render(stats, years) {
    current = stats;
    if (stats.empty) {
      app.innerHTML = controls(stats, years) +
        `<section class="card hero"><h1>No commits in ${stats.year}</h1>
        <p class="note">${stats.onlyMe ? `Looked for commits by ${esc(stats.emails.join(", ") || "you")}. Untick “Only my commits” or add your other emails in Settings › Year in Code.` : "Pick another year above."}</p></section>`;
      wire();
      return;
    }
    const s = stats;
    const langs = s.languages.map((l) =>
      `<div class="lang"><span class="name">${esc(l.name)}</span><span class="track"><span class="fill" style="width:${Math.max(l.pct, 2)}%"></span></span><span class="pct">${l.pct}%</span></div>`
    ).join("");
    const files = s.topFiles.map((f) => `<li><code>${esc(f.path)}</code><span>${plural(f.commits, "commit", "commits")}</span></li>`).join("");
    const words = s.topWords.map((w) => `<span class="chip">${esc(w.word)} <b>${w.n}</b></span>`).join("");
    const repos = s.repos.length > 1 ? `<section class="card"><h2>Across ${s.repos.length} repositories</h2><ul class="list">${
      s.repos.map((r) => `<li><code>${esc(r.name)}</code><span>${plural(r.commits, "commit", "commits")}</span></li>`).join("")}</ul></section>` : "";

    app.innerHTML = controls(s, years) + `
      <section class="card hero">
        <p class="kicker">Year in Code</p>
        <h1>Your ${s.year} in code</h1>
        <div class="tiles">
          <div><b>${fmt(s.commits)}</b><span>commits</span></div>
          <div><b>${fmt(s.activeDays)}</b><span>days coding</span></div>
          <div><b class="add">+${fmt(s.added)}</b><span>lines added</span></div>
          <div><b class="del">−${fmt(s.deleted)}</b><span>lines removed</span></div>
        </div>
        ${changeLine(s)}
      </section>

      <div class="grid">
        <section class="card accent">
          <p class="kicker">Your coder type</p>
          <h2 class="big">${esc(s.persona.name)}</h2>
          <p>${esc(s.persona.blurb)}</p>
          <p class="note">Favourite day: <b>${esc(s.topWeekday)}</b> · Busiest hour: <b>${hour12(s.topHour)}</b> · Weekends: <b>${s.weekendPct}%</b></p>
        </section>
        <section class="card">
          <p class="kicker">On a roll</p>
          <h2 class="big">${plural(s.streak.days, "day", "days")}</h2>
          <p>Longest streak${s.streak.days > 1 ? `, ${day(s.streak.from)} to ${day(s.streak.to)}` : ""}.</p>
          <p class="note">Biggest day: <b>${day(s.busiestDay.date)}</b> with ${plural(s.busiestDay.commits, "commit", "commits")}.</p>
        </section>
      </div>

      <section class="card">
        <p class="kicker">Month by month</p>
        <h2>${esc(s.topMonth)} was your biggest month</h2>
        ${bars(s.months, MONTHS)}
      </section>

      <section class="card">
        <p class="kicker">Around the clock</p>
        <h2>When you commit</h2>
        ${bars(s.hours, s.hours.map((_, h) => (h % 3 === 0 ? String(h) : "")), "hours")}
      </section>

      <div class="grid">
        <section class="card">
          <p class="kicker">Languages</p>
          <h2>${s.languages[0] ? esc(s.languages[0].name) + " led the way" : "Languages"}</h2>
          ${langs || '<p class="note">No source files recognised.</p>'}
        </section>
        <section class="card">
          <p class="kicker">Most touched files</p>
          <ul class="list">${files}</ul>
        </section>
      </div>

      <div class="grid">
        <section class="card">
          <p class="kicker">Biggest commit</p>
          <h2>“${esc(s.biggestCommit.subject)}”</h2>
          <p class="note">${fmt(s.biggestCommit.lines)} lines changed on ${day(s.biggestCommit.date)}.</p>
        </section>
        <section class="card">
          <p class="kicker">Bookends</p>
          <p>First commit: <b>“${esc(s.firstCommit.subject)}”</b> <span class="note">${day(s.firstCommit.date)}</span></p>
          <p>Last commit: <b>“${esc(s.lastCommit.subject)}”</b> <span class="note">${day(s.lastCommit.date)}</span></p>
          <p class="note">${plural(s.fixes, "commit was a fix", "commits were fixes")}. Bugs never stood a chance.</p>
        </section>
      </div>

      ${words ? `<section class="card"><p class="kicker">Your commit vocabulary</p><div class="chips">${words}</div></section>` : ""}
      ${repos}

      <footer>
        <span>Made with Year in Code. Everything stays on your machine.</span>
        <a href="#" id="coffee">☕ Buy me a coffee</a>
      </footer>`;
    wire();
  }

  function wire() {
    const year = document.getElementById("year");
    if (year) year.addEventListener("change", () => { loading(); vscode.postMessage({ type: "setYear", year: year.value }); });
    const only = document.getElementById("onlyMe");
    if (only) only.addEventListener("change", () => { loading(); vscode.postMessage({ type: "setOnlyMe", value: only.checked }); });
    const save = document.getElementById("save");
    if (save) save.addEventListener("click", () => vscode.postMessage({ type: "savePng", dataUrl: shareCard(current) }));
    const coffee = document.getElementById("coffee");
    if (coffee) coffee.addEventListener("click", (e) => { e.preventDefault(); vscode.postMessage({ type: "open", url: "https://buymeacoffee.com/mehmeteminf" }); });
  }

  function loading() {
    document.body.classList.add("busy");
  }

  // ---------- shareable PNG (1200x675) ----------
  function shareCard(s) {
    const W = 1200, H = 675;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#2a1f6b");
    grad.addColorStop(1, "#0f0c24");
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // soft glow
    const glow = g.createRadialGradient(W - 160, 120, 10, W - 160, 120, 420);
    glow.addColorStop(0, "rgba(139,123,234,0.45)");
    glow.addColorStop(1, "rgba(139,123,234,0)");
    g.fillStyle = glow;
    g.fillRect(0, 0, W, H);

    const font = (w, px) => `${w} ${px}px "Segoe UI", system-ui, -apple-system, sans-serif`;
    g.fillStyle = "#b9b0f5";
    g.font = font(700, 22);
    g.fillText("YEAR IN CODE", 64, 84);
    g.fillStyle = "#ffffff";
    g.font = font(800, 64);
    g.fillText(`My ${s.year} in code`, 64, 160);

    const tiles = [
      [fmt(s.commits), "commits"],
      [fmt(s.activeDays), "days coding"],
      [`${s.streak.days}`, "day streak"],
      [`+${compact(s.added)}`, "lines added"],
    ];
    tiles.forEach(([big, small], i) => {
      const x = 64 + i * 272, y = 210;
      g.fillStyle = "rgba(255,255,255,0.08)";
      roundRect(g, x, y, 248, 132, 18);
      g.fill();
      g.fillStyle = i === 3 ? "#7ee2a8" : "#ffffff";
      g.font = font(800, 50);
      g.fillText(big, x + 24, y + 70);
      g.fillStyle = "#c9c3ee";
      g.font = font(500, 22);
      g.fillText(small, x + 24, y + 108);
    });

    g.fillStyle = "#ffd966";
    g.font = font(800, 40);
    g.fillText(s.persona.name, 64, 420);
    g.fillStyle = "#e3dff8";
    g.font = font(400, 24);
    g.fillText(`Busiest month ${s.topMonth} · favourite day ${s.topWeekday}`, 64, 460);

    // languages
    const langs = s.languages.slice(0, 4);
    const colors = ["#8b7bea", "#5cc8ff", "#7ee2a8", "#ffd966"];
    // The bar shows the top four languages relative to each other, so it always fills the width.
    let x = 64;
    const barW = W - 128;
    const shown = langs.reduce((a, l) => a + Math.max(l.pct, 1), 0) || 1;
    langs.forEach((l, i) => {
      const w = i === langs.length - 1 ? 64 + barW - x : Math.round((Math.max(l.pct, 1) / shown) * barW);
      g.fillStyle = colors[i];
      g.fillRect(x, 512, w, 18);
      x += w;
    });
    let lx = 64;
    g.font = font(600, 22);
    langs.forEach((l, i) => {
      g.fillStyle = colors[i];
      g.fillRect(lx, 556, 14, 14);
      g.fillStyle = "#e3dff8";
      const label = `${l.name} ${l.pct}%`;
      g.fillText(label, lx + 22, 570);
      lx += g.measureText(label).width + 56;
    });

    // Every shared card tells the viewer how to make their own.
    g.fillStyle = "#9d95cf";
    g.font = font(500, 20);
    g.fillText("Make yours: search “Year in Code” in VS Code extensions", 64, 630);
    return c.toDataURL("image/png");
  }

  function compact(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e4) return Math.round(n / 1e3) + "k";
    return fmt(n);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  window.addEventListener("message", (e) => {
    const msg = e.data;
    document.body.classList.remove("busy");
    if (msg.type === "stats") render(msg.stats, msg.years);
    if (msg.type === "error") app.innerHTML = `<section class="card"><h2>Couldn't read git history</h2><p class="note">${esc(msg.message)}</p></section>`;
  });

  // For screenshots and tests outside VS Code.
  window.__yearInCode = { render, shareCard };
  vscode.postMessage({ type: "ready" });
})();
