export async function readMarkdownUpload(request: Request): Promise<{body:string} | {error:string}> {
  let file: FormDataEntryValue | null;
  try { file = (await request.formData()).get("file"); } catch { return {error:"Upload a Markdown file"}; }
  if (!file || typeof file === "string" || !/\.md$/i.test(file.name)) return {error:"Choose a .md file"};
  if (!file.size || file.size > 65536) return {error:"File must contain 1–65536 bytes"};
  let body: string;
  try { body = new TextDecoder("utf-8", {fatal:true}).decode(await file.arrayBuffer()).replace(/^\uFEFF/, ""); }
  catch { return {error:"File must be valid UTF-8"}; }
  if (/^---\r?\n/.test(body)) {
    const match = body.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)([\s\S]*)$/);
    if (!match) return {error:"Unclosed Markdown frontmatter"};
    body = match[1].replace(/^\r?\n/, "");
  }
  if (!body.trim()) return {error:"Markdown body must not be empty"};
  return {body};
}
