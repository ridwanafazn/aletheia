import { mkdirSync, readFileSync } from "node:fs";

import { createRequire } from "node:module";

import { dirname, resolve } from "node:path";

import { fileURLToPath } from "node:url";



const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = resolve(HERE, "../../..");

const OUT = resolve(HERE);

const SCREENSHOT = resolve(HERE, "gallery/07-mis-intelligence.png");

mkdirSync(OUT, { recursive: true });



const require = createRequire(import.meta.url);

const { chromium } = require(resolve(ROOT, "apps/web/node_modules/@playwright/test"));



const bricolage = readFileSync(resolve(HERE, "source/fonts/bricolage.woff2")).toString("base64");

const publicSans = readFileSync(resolve(HERE, "source/fonts/public-sans.woff2")).toString("base64");

const jetbrains = readFileSync(resolve(HERE, "source/fonts/jetbrains.woff2")).toString("base64");

const screenshot = readFileSync(SCREENSHOT).toString("base64");

const mark = readFileSync(resolve(HERE, "source/aletheia-mark.svg"), "utf8");



const fontFaces = `

  @font-face { font-family: "Bricolage"; src: url(data:font/woff2;base64,${bricolage}) format("woff2"); font-weight: 200 800; font-style: normal; }

  @font-face { font-family: "Public Sans"; src: url(data:font/woff2;base64,${publicSans}) format("woff2"); font-weight: 100 900; font-style: normal; }

  @font-face { font-family: "JetBrains Mono"; src: url(data:font/woff2;base64,${jetbrains}) format("woff2"); font-weight: 100 800; font-style: normal; }

`;



function bannerHtml() {

  return `<!doctype html>

<html><head><meta charset="utf-8"><style>

${fontFaces}

* { box-sizing: border-box; }

html, body { margin: 0; width: 2400px; height: 1350px; overflow: hidden; }

body { background: #f8f7f4; color: #14160f; font-family: "Public Sans", sans-serif; }

.canvas { position: relative; width: 2400px; height: 1350px; overflow: hidden;

  background-image:

    linear-gradient(#e7e6df 1px, transparent 1px),

    linear-gradient(90deg, #e7e6df 1px, transparent 1px);

  background-size: 80px 80px;

  background-position: -1px -1px;

}

.veil { position: absolute; inset: 0; background: linear-gradient(90deg, #f8f7f4 0%, #f8f7f4 43%, rgba(248,247,244,.92) 55%, rgba(248,247,244,.35) 75%, rgba(248,247,244,.1) 100%); }

.top { position: absolute; top: 58px; left: 150px; right: 150px; display: flex; align-items: center; justify-content: space-between; }

.brand { display: flex; align-items: center; gap: 16px; }

.brand svg { width: 54px; height: 54px; }

.brand-name { font-family: "JetBrains Mono", monospace; font-size: 25px; font-weight: 700; letter-spacing: -0.02em; }

.brand-sub { font-family: "JetBrains Mono", monospace; font-size: 12px; font-weight: 600; letter-spacing: .16em; color: #5a5e4e; margin-top: 3px; }

.top-right { display: flex; align-items: center; gap: 18px; font-family: "JetBrains Mono", monospace; font-size: 15px; font-weight: 700; letter-spacing: .14em; }

.square { width: 12px; height: 12px; background: #d9480f; }

.left { position: absolute; left: 150px; top: 288px; width: 1040px; }

.eyebrow { display: flex; align-items: center; gap: 14px; font-family: "JetBrains Mono", monospace; font-size: 17px; font-weight: 700; letter-spacing: .16em; color: #c2410c; }

.eyebrow .line { width: 54px; height: 2px; background: #d9480f; }

h1 { margin: 26px 0 0; font-family: "Bricolage", sans-serif; font-size: 238px; line-height: .84; letter-spacing: -.065em; font-weight: 500; }

.sub { margin-top: 34px; max-width: 860px; font-size: 47px; line-height: 1.16; letter-spacing: -.025em; font-weight: 500; }

.copy { margin-top: 28px; max-width: 790px; font-size: 27px; line-height: 1.52; color: #5a5e4e; }

.tags { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 36px; }

.tag { padding: 11px 17px; border: 1px solid #bfc4b4; border-radius: 4px; background: rgba(241,242,236,.72); font-family: "JetBrains Mono", monospace; font-size: 16px; font-weight: 600; letter-spacing: .02em; }

.foot { position: absolute; left: 150px; right: 150px; bottom: 64px; display: flex; justify-content: space-between; align-items: center; font-family: "JetBrains Mono", monospace; font-size: 15px; font-weight: 600; letter-spacing: .12em; color: #5a5e4e; }

.foot strong { color: #14160f; }

.shot-wrap { position: absolute; right: 118px; top: 286px; width: 1120px; }

.shot-shadow { position: absolute; inset: 24px -24px 0 24px; border: 2px solid #d9480f; }

.shot { position: relative; width: 1120px; height: 700px; border: 1px solid #bfc4b4; background: #fff; box-shadow: 0 40px 90px -46px rgba(20,22,15,.55); overflow: hidden; }

.shot img { width: 100%; height: 100%; object-fit: cover; object-position: top left; display: block; }

.live { position: absolute; top: 0; left: 0; background: #14160f; color: #f8f7f4; font-family: "JetBrains Mono", monospace; font-size: 14px; font-weight: 700; letter-spacing: .14em; padding: 12px 18px; }

.caption { margin-top: 34px; padding-left: 28px; display: flex; justify-content: space-between; font-family: "JetBrains Mono", monospace; font-size: 14px; color: #5a5e4e; letter-spacing: .04em; }

</style></head>

<body><div class="canvas">

  <div class="veil"></div>

  <div class="top">

    <div class="brand">${mark}<div><div class="brand-name">Aletheia</div><div class="brand-sub">PEOPLE OPERATIONS</div></div></div>

    <div class="top-right"><span>PORTFOLIO / 2026</span><span class="square"></span></div>

  </div>

  <div class="left">

    <div class="eyebrow"><span class="line"></span>EXPLORATION — DISBURSEMENT GOVERNANCE</div>

    <h1>Aletheia</h1>

    <div class="sub">Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS.</div>

    <div class="copy">Policy versioning, segregation of duties, dan audit hash chain — dipelajari dan dibangun dari nol sebagai eksplorasi sistem.</div>

    <div class="tags">

      <span class="tag">React 19</span><span class="tag">TypeScript</span><span class="tag">PostgreSQL</span><span class="tag">Go</span><span class="tag">Cloudflare</span>

    </div>

  </div>

  <div class="shot-wrap">

    <div class="shot-shadow"></div>

    <div class="shot"><span class="live">LIVE DEMO</span><img src="data:image/png;base64,${screenshot}" alt=""></div>

    <div class="caption"><span>MIS INTELLIGENCE — 3 CABANG</span><span>15 BULAN HISTORI</span></div>

  </div>

  <div class="foot"><span><strong>SYNTHETIC DATA</strong> · LIVE DEMO · 32 PERSONEL / 8 DIVISI</span><span>REACT / TYPESCRIPT / POSTGRES / GO</span></div>

</div></body></html>`;

}



function ogHtml() {

  return `<!doctype html>

<html><head><meta charset="utf-8"><style>

${fontFaces}

* { box-sizing: border-box; }

html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }

body { background: #f8f7f4; color: #14160f; font-family: "Public Sans", sans-serif; }

.canvas { position: relative; width: 1200px; height: 630px; overflow: hidden; background-image: linear-gradient(#e7e6df 1px, transparent 1px), linear-gradient(90deg, #e7e6df 1px, transparent 1px); background-size: 40px 40px; }

.veil { position: absolute; inset: 0; background: linear-gradient(90deg, #f8f7f4 0%, #f8f7f4 42%, rgba(248,247,244,.85) 58%, rgba(248,247,244,.2) 100%); }

.top { position: absolute; top: 34px; left: 54px; right: 54px; display: flex; align-items: center; justify-content: space-between; }

.brand { display: flex; align-items: center; gap: 10px; }

.brand svg { width: 30px; height: 30px; }

.brand-name { font-family: "JetBrains Mono", monospace; font-size: 15px; font-weight: 700; letter-spacing: -.02em; }

.top-right { font-family: "JetBrains Mono", monospace; font-size: 10px; font-weight: 700; letter-spacing: .14em; }

.left { position: absolute; left: 54px; top: 150px; width: 560px; }

.eyebrow { font-family: "JetBrains Mono", monospace; font-size: 10px; font-weight: 700; letter-spacing: .14em; color: #c2410c; }

h1 { margin: 12px 0 0; font-family: "Bricolage", sans-serif; font-size: 116px; line-height: .86; letter-spacing: -.06em; font-weight: 500; }

.sub { margin-top: 18px; font-size: 24px; line-height: 1.2; letter-spacing: -.02em; font-weight: 500; max-width: 480px; }

.tags { display: flex; gap: 7px; margin-top: 20px; font-family: "JetBrains Mono", monospace; font-size: 9px; font-weight: 600; }

.tag { border: 1px solid #bfc4b4; background: #f1f2ec; border-radius: 3px; padding: 6px 9px; }

.shot-wrap { position: absolute; right: 52px; top: 152px; width: 536px; }

.shot-shadow { position: absolute; inset: 12px -12px -12px 12px; border: 1.5px solid #d9480f; }

.shot { position: relative; width: 536px; height: 335px; border: 1px solid #bfc4b4; background: #fff; overflow: hidden; box-shadow: 0 24px 50px -30px rgba(20,22,15,.55); }

.shot img { width: 100%; height: 100%; object-fit: cover; object-position: top left; display: block; }

.live { position: absolute; top: 0; left: 0; background: #14160f; color: #f8f7f4; font-family: "JetBrains Mono", monospace; font-size: 8px; font-weight: 700; letter-spacing: .12em; padding: 7px 10px; }

.foot { position: absolute; left: 54px; right: 54px; bottom: 30px; display: flex; justify-content: space-between; font-family: "JetBrains Mono", monospace; font-size: 9px; font-weight: 600; letter-spacing: .1em; color: #5a5e4e; }

</style></head>

<body><div class="canvas"><div class="veil"></div>

  <div class="top"><div class="brand">${mark}<div class="brand-name">Aletheia</div></div><div class="top-right">PORTFOLIO / 2026</div></div>

  <div class="left">

    <div class="eyebrow">EXPLORATION — DISBURSEMENT GOVERNANCE</div>

    <h1>Aletheia</h1>

    <div class="sub">Ruang eksplorasi fullstack untuk klaim, payroll, dan MIS.</div>

    <div class="tags"><span class="tag">React 19</span><span class="tag">TypeScript</span><span class="tag">PostgreSQL</span><span class="tag">Go</span></div>

  </div>

  <div class="shot-wrap"><div class="shot-shadow"></div><div class="shot"><span class="live">LIVE DEMO</span><img src="data:image/png;base64,${screenshot}" alt=""></div></div>

  <div class="foot"><span>SYNTHETIC DATA · LIVE DEMO</span><span>15 BULAN HISTORI</span></div>

</div></body></html>`;

}



const browser = await chromium.launch();

const page = await browser.newPage({ viewport: { width: 2400, height: 1350 }, deviceScaleFactor: 1 });

await page.setContent(bannerHtml(), { waitUntil: "load" });

await page.screenshot({ path: resolve(OUT, "banner-aletheia-2400x1350.png") });



await page.setViewportSize({ width: 1600, height: 900 });

await page.setContent(

  bannerHtml().replace("html, body { margin: 0; width: 2400px; height: 1350px;", "html, body { margin: 0; width: 1600px; height: 900px;").replaceAll("2400px", "1600px").replaceAll("1350px", "900px"),

  { waitUntil: "load" },

);

// The layout above is fixed to 2400px; scale it into a 1600px frame instead.

await page.setContent(bannerHtml(), { waitUntil: "load" });

await page.addStyleTag({ content: "body { transform: scale(0.6666667); transform-origin: top left; }" });

await page.setViewportSize({ width: 1600, height: 900 });

await page.screenshot({ path: resolve(OUT, "banner-1600x900.png") });



await page.setViewportSize({ width: 1200, height: 630 });

await page.setContent(ogHtml(), { waitUntil: "load" });

await page.screenshot({ path: resolve(OUT, "banner-og-1200x630.png") });



await browser.close();

console.log("banners written");

