#!/usr/bin/env node
import { NewsfeedClient } from "./client.js";
import {
  handlePostCreate,
  handleRuleSet,
  handleRuleSupersede,
  handleSearch,
  handleFeed,
} from "./commands.js";

function printUsage() {
  console.log(`
JonVerk Newsfeed CLI

Usage:
  newsfeed feed [--json]
  newsfeed search <query>
  newsfeed post create <file.md> [--title <title>] [--kind <kind>] [--slug <slug>] [--draft]
  newsfeed rule set <slug> <file.md> [--title <title>] [--category <cat>] [--owner <owner>] [--rule-id <id>]
  newsfeed rule supersede <slug> <new-rule-id>
  newsfeed org

Environment Variables:
  NEWSFEED_URL    Target endpoint (default: https://newsfeed.jonverk.online)
  NEWSFEED_TOKEN  Bearer authentication token for write operations
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printUsage();
    process.exit(0);
  }

  const client = new NewsfeedClient();
  const cmd = args[0];

  try {
    if (cmd === "feed") {
      const asJson = args.includes("--json");
      await handleFeed(client, asJson);
    } else if (cmd === "search") {
      const query = args[1];
      if (!query) {
        console.error("Error: Query string required");
        process.exit(1);
      }
      await handleSearch(client, query);
    } else if (cmd === "org") {
      const org = await client.getOrgChart();
      console.log(org);
    } else if (cmd === "post" && args[1] === "create") {
      const file = args[2];
      if (!file) {
        console.error("Error: Markdown file path required");
        process.exit(1);
      }
      const titleIdx = args.indexOf("--title");
      const title = titleIdx !== -1 ? args[titleIdx + 1] : undefined;
      const kindIdx = args.indexOf("--kind");
      const kind = kindIdx !== -1 ? args[kindIdx + 1] : undefined;
      const slugIdx = args.indexOf("--slug");
      const slug = slugIdx !== -1 ? args[slugIdx + 1] : undefined;
      const draft = args.includes("--draft");

      await handlePostCreate(client, { file, title, kind, slug, draft });
    } else if (cmd === "rule" && args[1] === "set") {
      const slug = args[2];
      const file = args[3];
      if (!slug || !file) {
        console.error("Error: slug and file path required: newsfeed rule set <slug> <file.md>");
        process.exit(1);
      }
      const titleIdx = args.indexOf("--title");
      const title = titleIdx !== -1 ? args[titleIdx + 1] : undefined;
      const catIdx = args.indexOf("--category");
      const category = catIdx !== -1 ? args[catIdx + 1] : undefined;
      const ownerIdx = args.indexOf("--owner");
      const owner = ownerIdx !== -1 ? args[ownerIdx + 1] : undefined;
      const ruleIdIdx = args.indexOf("--rule-id");
      const ruleId = ruleIdIdx !== -1 ? args[ruleIdIdx + 1] : undefined;

      await handleRuleSet(client, { slug, file, title, category, owner, ruleId });
    } else if (cmd === "rule" && args[1] === "supersede") {
      const slug = args[2];
      const newRuleId = args[3];
      if (!slug || !newRuleId) {
        console.error("Error: slug and new-rule-id required: newsfeed rule supersede <slug> <new-rule-id>");
        process.exit(1);
      }
      await handleRuleSupersede(client, slug, newRuleId);
    } else {
      console.error(`Unknown command: ${args.join(" ")}`);
      printUsage();
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
