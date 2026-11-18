// Records images/demo.gif: the panel scrolling through a year, ending on the share card.
//   node scripts/demo-gif.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { GIFEncoder, quantize, applyPalette } = require("gifenc");

const root = path.join(__dirname, "..");
const W = 880, H = 520;

(async () => {
  // Reuse the synthetic year from preview.js by running it in-process.
  const css = fs.readFileSync(path.join(root, "media", "panel.css"), "utf8");
  const js = fs.readFileSync(path.join(root, "media", "panel.js"), "utf8");
  const { compute } = require("../src/stats");
  const year = new Date().getFullYear();
  const stats = require("./preview-data")(compute, year);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const vars = "--vscode-foreground:#cccccc;--vscode-editor-background:#1f1f1f;--vscode-descriptionForeground:#9d9d9d;--vscode-button-background:#0078d4;--vscode-button-foreground:#fff";
  await page.setContent(`<html style="${vars}"><head><style>${css} body{padding:16px 20px}</style></head><body><div id="app"></div><script>${js}</script></body></html>`);

  const frames = []; // [pngBuffer, delayMs]
  const grab = async (delay) => frames.push([await page.screenshot(), delay]);

  // "Reading your git history…" then the recap appears.
  await page.evaluate(() => (document.getElementById("app").innerHTML = '<p class="loading" style="font-size:18px;padding:40px">Reading your git history…</p>'));
  await grab(900);
  await page.evaluate(({ stats, year }) => window.__yearInCode.render(stats, [year, year - 1]), { stats, year });
  await grab(1800);

  // Smooth scroll down through the cards.
  const total = await page.evaluate(() => document.body.scrollHeight - innerHeight);
  const stops = [0.2, 0.42, 0.62, 0.82, 1];
  let y = 0;
  for (const stop of stops) {
    const target = Math.round(total * stop);
    for (let i = 1; i <= 6; i++) {
      await page.evaluate((v) => scrollTo(0, v), Math.round(y + ((target - y) * i) / 6));
      await grab(60);
    }
    y = target;
    await grab(1300);
  }

  // End on the share card.
  const card = await page.evaluate((s) => window.__yearInCode.shareCard(s), stats);
  await page.setContent(`<body style="margin:0;background:#1f1f1f;display:flex;align-items:center;justify-content:center;height:${H}px;font-family:Segoe UI,sans-serif;color:#ccc;flex-direction:column;gap:10px">
    <div style="font-size:15px">Save as image → share it</div>
    <img src="${card}" style="width:${W - 120}px;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.5)"></body>`);
  await grab(3200);
  await browser.close();

  // Encode with one shared palette so colours stay stable between frames.
  const decoded = frames.map(([buf, delay]) => [PNG.sync.read(buf), delay]);
  const sample = new Uint8Array(decoded.length * W * H * 4 / 4);
  // Build palette from every 4th frame pixel sample.
  let o = 0;
  for (const [png] of decoded) {
    for (let i = 0; i < png.data.length && o < sample.length; i += 16) {
      sample[o++] = png.data[i]; sample[o++] = png.data[i + 1]; sample[o++] = png.data[i + 2]; sample[o++] = 255;
    }
  }
  const palette = quantize(sample.subarray(0, o), 256);
  const gif = GIFEncoder();
  for (const [png, delay] of decoded) {
    const index = applyPalette(png.data, palette);
    gif.writeFrame(index, W, H, { palette, delay });
  }
  gif.finish();
  const out = path.join(root, "images", "demo.gif");
  fs.writeFileSync(out, gif.bytes());
  console.log(`wrote images/demo.gif (${frames.length} frames, ${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
})();
