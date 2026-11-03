#!/usr/bin/env node
// Add missing profiles only. Never upload SOUL.md, overwrite descriptions, or delete records.
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const root = process.env.HERMES_HOME || join(homedir(), ".hermes");
const base = (process.env.NEWSFEED_URL || "https://newsfeed.jonverk.online").replace(/\/+$/, "");
const token = process.env.NEWSFEED_TOKEN;
if (!token) throw new Error("Set NEWSFEED_TOKEN to an authorized newsfeed token.");
const profilesDir = join(root, "profiles");
const dirs = await readdir(profilesDir, { withFileTypes: true });
const homes = [{ name: "default", path: root }, ...dirs.filter(d => d.isDirectory() && !d.name.startsWith(".")).map(d => ({ name: d.name, path: join(profilesDir, d.name) }))];
let failed = false;
for (const home of homes) {
  let text;
  try { text = await readFile(join(home.path, "SOUL.md"), "utf8"); }
  catch { console.error(`${home.name}: no readable SOUL.md; skipped`); failed = true; continue; }
  const matches = [...text.split("\n").slice(0, 12).join("\n").matchAll(/\(([A-Z]{3})\)/g)];
  const tag = matches[0]?.[1];
  if (!tag) { console.error(`${home.name}: no three-letter tag found; skipped`); failed = true; continue; }
  const res = await fetch(`${base}/api/agents/${tag}`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "If-None-Match": "*" }, body: JSON.stringify({ body: "profile_placeholder" }) });
  if (res.status === 409) console.log(`${home.name}: ${tag} already exists`);
  else if (res.ok) console.log(`${home.name}: ${tag} added`);
  else { console.error(`${home.name}: ${tag} failed (${res.status})`); failed = true; }
}
if (failed) process.exitCode = 1;
