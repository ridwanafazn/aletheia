import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = new URL("../dist/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const manifest = JSON.parse(readFileSync(join(dist, ".vite", "manifest.json"), "utf8"));

const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
if (entryKey === undefined) {
  throw new Error("Entry manifest tidak ditemukan");
}

const seen = new Set();
function collect(key) {
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  const record = manifest[key];
  if (record === undefined) {
    return;
  }
  for (const imported of record.imports ?? []) {
    collect(imported);
  }
}

collect(entryKey);
let total = 0;
for (const key of seen) {
  const file = manifest[key].file;
  total += gzipSync(readFileSync(join(dist, file))).byteLength;
}

const limit = 200 * 1024;
const kb = (total / 1024).toFixed(1);
console.log(`Initial JavaScript gzip: ${kb} KB across ${seen.size} chunk(s)`);
if (total > limit) {
  console.error(`Batas initial bundle 200 KB terlampaui: ${kb} KB`);
  process.exitCode = 1;
}
