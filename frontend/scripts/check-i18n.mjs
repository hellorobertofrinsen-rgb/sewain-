// Fails when a t("…") string in the app has no English translation in src/lib/i18n.en.ts.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(f) && !p.endsWith("i18n.en.ts")) files.push(p);
  }
};
walk("app");
walk("src");

const en = readFileSync("src/lib/i18n.en.ts", "utf8");
const have = new Set([...en.matchAll(/^ {2}("(?:[^"\\]|\\.)*"):/gm)].map((m) => JSON.parse(m[1])));
const missing = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt\(\s*("(?:[^"\\]|\\.)*")/g)) {
    const key = JSON.parse(m[1]);
    if (!have.has(key)) missing.add(`${f}: ${key}`);
  }
}
if (missing.size) {
  console.error(`Missing English for ${missing.size} string(s):\n` + [...missing].join("\n"));
  process.exit(1);
}
console.log(`i18n: all ${have.size} strings have English.`);
