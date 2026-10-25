import * as fs from "node:fs";
import { NewsfeedClient } from "./client.js";

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  const rawYaml = match[1];
  const body = match[2];
  const frontmatter: Record<string, string> = {};
  for (const line of rawYaml.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      const key = line.slice(0, colon).trim().toLowerCase();
      let val = line.slice(colon + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      frontmatter[key] = val;
    }
  }
  return { frontmatter, body };
}

export async function handlePostCreate(client: NewsfeedClient, args: {
  file: string;
  title?: string;
  kind?: string;
  slug?: string;
  author?: string;
  draft?: boolean;
}) {
  const content = fs.readFileSync(args.file, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const title = args.title || frontmatter.title || "";
  if (!title) {
    throw new Error("Title is required (provide via --title or markdown frontmatter)");
  }
  const kind = (args.kind || frontmatter.kind || "announcement") as any;
  const slug = args.slug || frontmatter.slug;
  const author = args.author || frontmatter.author;
  const draft = args.draft !== undefined ? args.draft : frontmatter.draft === "true";

  const res = await client.createPost({
    title,
    body: body.trim(),
    kind,
    slug,
    author,
    draft,
  });
  console.log(`Post created: ${res.url || res.slug} (ID: ${res.id})`);
  return res;
}

export async function handleRuleSet(client: NewsfeedClient, args: {
  slug: string;
  file: string;
  title?: string;
  category?: string;
  owner?: string;
  ruleId?: string;
}) {
  const content = fs.readFileSync(args.file, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);
  const title = args.title || frontmatter.title || "";
  if (!title) {
    throw new Error("Title is required (provide via --title or markdown frontmatter)");
  }
  const category = (args.category || frontmatter.category || "rules") as any;
  const owner = args.owner || frontmatter.owner || "";
  const rule_id = args.ruleId || frontmatter.rule_id;

  const res = await client.setRule(args.slug, {
    title,
    body: body.trim(),
    category,
    owner,
    rule_id,
  });
  console.log(`Rule updated/created: ${res.rule_id} -> /handbook/${res.slug}`);
  return res;
}

export async function handleRuleSupersede(client: NewsfeedClient, slug: string, supersededBy: string) {
  const res = await client.supersedeRule(slug, supersededBy);
  console.log(`Rule ${slug} superseded by ${supersededBy}`);
  return res;
}

export async function handleSearch(client: NewsfeedClient, query: string) {
  const res = await client.search(query);
  console.log(`Search results for "${query}":`);
  if (!res.hits || res.hits.length === 0) {
    console.log("No hits found.");
  } else {
    for (const hit of res.hits) {
      console.log(`- [${hit.kind}] ${hit.title} (${hit.url})`);
    }
  }
  return res;
}

export async function handleFeed(client: NewsfeedClient, asJson = false) {
  const feed = await client.getFeed();
  if (asJson) {
    console.log(JSON.stringify(feed, null, 2));
  } else {
    console.log(`JonVerk Newsfeed — Latest Updates (updated: ${feed.updated_at})`);
    for (const item of feed.items || []) {
      console.log(`- [${item.kind}] ${item.title} (${item.url})`);
    }
  }
  return feed;
}
