// Renders media/icon.svg to media/icon.png (the Marketplace needs a 128x128 PNG).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const svg = fs.readFileSync(path.join(__dirname, "..", "media", "icon.svg"), "utf8").replace("<svg ", '<svg width="128" height="128" ');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 128, height: 128 } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: path.join(__dirname, "..", "media", "icon.png"), omitBackground: true });
  await browser.close();
  console.log("wrote media/icon.png");
})();
