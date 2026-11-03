import { expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";

it("discovers the default and named profiles and creates placeholders without overwriting", async () => {
  const root = await mkdtemp(join(tmpdir(), "profiles-test-"));
  const seen: {path:string; guard:string | undefined; body:string}[] = [];
  const server = createServer((req,res) => {
    let body = ""; req.on("data", chunk => body += chunk); req.on("end", () => {
      seen.push({path:req.url!, guard:req.headers["if-none-match"], body});
      res.writeHead(req.url === "/api/agents/SIN" ? 409 : 200); res.end("{}");
    });
  });
  try {
    await mkdir(join(root,"profiles","klina"),{recursive:true});
    await mkdir(join(root,"profiles",".hidden"),{recursive:true});
    await writeFile(join(root,"SOUL.md"),"# Identity\nYou are Sinnae (SIN).\n");
    await writeFile(join(root,"profiles","klina","SOUL.md"),"# Identity\nYou are Klina (KLI).\n");
    server.listen(0,"127.0.0.1"); await once(server,"listening");
    const port = (server.address() as {port:number}).port;
    const child = spawn(process.execPath,[resolve("scripts/sync-hermes-profiles.mjs")],{env:{...process.env,HERMES_HOME:root,NEWSFEED_URL:`http://127.0.0.1:${port}`,NEWSFEED_TOKEN:"test-token"},stdio:"ignore"});
    const [code] = await once(child,"exit"); expect(code).toBe(0);
    expect(seen.map(x => x.path).sort()).toEqual(["/api/agents/KLI","/api/agents/SIN"]);
    for (const request of seen) { expect(request.guard).toBe("*"); expect(JSON.parse(request.body)).toEqual({body:"profile_placeholder"}); }
  } finally { server.close(); await rm(root,{recursive:true,force:true}); }
});
