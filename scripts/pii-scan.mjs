import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const ROOTS = ["apps", "services", "packages", "scripts"];
const EXCLUDED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".turbo",
  "coverage",
  "test-results",
  "playwright-report",
]);
const EXCLUDED_FILES = [/seed\.ts$/, /\.test\.ts$/, /\.spec\.ts$/, /fixtures?\//, /\.d\.ts$/];

const RAW_PATTERNS = [
  { name: "raw NIK literal", regex: /\bnik\s*[:=]\s*["'`]\d{16}["'`]/i },
  { name: "raw bank account literal", regex: /\bbank_account\w*\s*[:=]\s*["'`]\d{10,}["'`]/i },
  {
    name: "raw NIK or bank account in log",
    regex:
      /(?:logger|console)\.(?:info|warn|error|debug)\([^)]{0,600}\b(?:nik|bank_account_number|bank_account_hash)\b/i,
  },
];

const findings = [];
let scanned = 0;

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        await walk(fullPath);
      }
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      continue;
    }
    const relativePath = relative(ROOT, fullPath).replaceAll("\\", "/");
    if (EXCLUDED_FILES.some((pattern) => pattern.test(relativePath))) {
      continue;
    }
    const source = await readFile(fullPath, "utf8");
    scanned += 1;
    for (const pattern of RAW_PATTERNS) {
      const match = pattern.regex.exec(source);
      if (match === null) {
        continue;
      }
      const line = source.slice(0, match.index).split("\n").length;
      findings.push({
        file: relativePath,
        line,
        pattern: pattern.name,
        preview: match[0].replace(/\d/g, "•").slice(0, 100),
      });
    }
  }
}

async function main() {
  for (const root of ROOTS) {
    await walk(join(ROOT, root));
  }
  console.log(`Scanned ${scanned} source files`);
  if (findings.length === 0) {
    console.log("PASS no raw NIK or bank account literals found in application source");
    return;
  }
  for (const finding of findings) {
    console.log(`BLOCKER ${finding.file}:${finding.line} ${finding.pattern} ${finding.preview}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("PII_SCAN_FAILED", error);
  process.exitCode = 1;
});
