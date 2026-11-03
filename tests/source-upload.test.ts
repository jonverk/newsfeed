import { beforeEach, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
const base="https://x.test";
const auth={authorization:"Bearer test-token","content-type":"application/json"};
const json=(method:string,body:unknown) => ({method,headers:auth,body:JSON.stringify(body)});
const upload=(body:string,name="update.md") => {const form=new FormData(); form.set("file",new File([body],name)); return form;};
beforeEach(async () => { for (const table of ["posts","rules","entry_tags","tags","search_index","agent_profiles"]) await env.DB.prepare(`DELETE FROM ${table}`).run(); });
it("round-trips news and rules without changing title, categories or draft status", async () => {
  const draft=await (await SELF.fetch(base+"/api/posts",json("POST",{title:"Private",body:"old",draft:true}))).json<{slug:string}>();
  await SELF.fetch(base+"/api/rules/policy",json("PUT",{title:"Policy",body:"old"}));
  await SELF.fetch(base+"/api/tags/rule/policy",json("PUT",{tags:["Safety"]}));
  for(const [kind,id] of [["post",draft.slug],["rule","policy"]]) {
    const path=`/api/source/${kind}/${id}`;
    expect((await SELF.fetch(base+path,{method:"PUT",body:upload("new")})).status).toBe(401);
    const original=await SELF.fetch(base+path,{headers:{authorization:auth.authorization}}); expect(original.status).toBe(200); expect(await original.text()).toContain("old");
    const response=await SELF.fetch(base+path,{method:"PUT",headers:{authorization:auth.authorization},body:upload("---\ntitle: ignored\n---\n\nnew text")}); expect(response.status).toBe(200);
  }
  const post=await env.DB.prepare("SELECT title,status,body_md FROM posts WHERE slug=?").bind(draft.slug).first(); expect(post).toMatchObject({title:"Private",status:"draft",body_md:"new text"});
  expect((await SELF.fetch(base+`/news/${draft.slug}.md`)).status).toBe(404);
  const rule=await (await SELF.fetch(base+"/api/rules/policy")).json<any>(); expect(rule).toMatchObject({title:"Policy",body_md:"new text",tags:["Safety"]});
  expect((await (await SELF.fetch(base+"/api/search?q=new")).text())).toContain("policy");
});
it("replaces profile Markdown and rejects invalid files without changing it", async () => {
  await SELF.fetch(base+"/api/agents/ABC",json("PUT",{body:"before"}));
  const path=base+"/api/source/agent/ABC";
  expect((await SELF.fetch(path,{method:"PUT",headers:{authorization:auth.authorization},body:upload("bad","bad.txt")})).status).toBe(400);
  expect(await (await SELF.fetch(base+"/org/ABC.md")).text()).toBe("before");
  const old=await SELF.fetch(base+"/org/ABC.md");
  expect((await SELF.fetch(path,{method:"PUT",headers:{authorization:auth.authorization},body:upload("replacement")})).status).toBe(200);
  const changed=await SELF.fetch(base+"/org/ABC.md",{headers:{"if-none-match":old.headers.get("etag")!}}); expect(changed.status).toBe(200); expect(await changed.text()).toBe("replacement");
  expect((await SELF.fetch(base+"/api/source/agent/ABC")).status).toBe(401);
});
