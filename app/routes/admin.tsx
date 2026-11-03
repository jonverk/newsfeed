import { useRef, useState, type FormEvent } from "react";
import { data, Link, useLoaderData, useNavigate, useRevalidator, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { Layout } from "../components/Layout";
import { adminRequest, AdminRequestError } from "../lib/admin-client";
import { adminHeaders, loadAdmin, type AdminData } from "../../workers/lib/admin";
import type { AppEnv } from "../../workers/lib/env";
import type { Post, Rule } from "../../workers/lib/content";
import { slugify } from "../../workers/lib/slug";

export const meta = () => [{ title: "Administration — JonVerk" }, { name: "robots", content: "noindex, nofollow" }];
export const headers = () => adminHeaders;
export async function loader({ request, context }: LoaderFunctionArgs) {
  return data(await loadAdmin(request, context.cloudflare.env as AppEnv), { headers: adminHeaders });
}

function useTask() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  async function run(task: () => Promise<void>) {
    if (pending) return;
    setPending(true); setError(null);
    try { await task(); }
    catch (cause) { setError(cause instanceof Error ? cause : new Error("The request failed. Try again.")); }
    finally { setPending(false); }
  }
  return { pending, error, run };
}

function Failure({ error }: { error: Error | null }) {
  if (!error) return null;
  return <div role="alert" className="admin-error">
    <p>{error.message}</p>
    {error instanceof AdminRequestError && error.status === 401 && <p><a href="/login" target="_blank" rel="noreferrer" className="underline">Log in in a new tab</a>, then try saving again. Your text is still here.</p>}
  </div>;
}

function EntryEditor({ section, item, tags, selectedTags }: { section: "news" | "rules"; item: Post | Rule | null; tags: string[]; selectedTags: string[] }) {
  const task = useTask();
  const navigate = useNavigate();
  const creationKey = useRef<string | null>(null);
  const news = section === "news";
  const post = news ? item as Post | null : null;
  const rule = news ? null : item as Rule | null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const intent = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") || (post?.status === "published" ? "save" : "draft");
    await task.run(async () => {
      const title = String(form.get("title") || "");
      const body = String(form.get("body") || "");
      let savedSlug = item?.slug;
      if (news) {
        const input = { title, body };
        if (!item) {
          creationKey.current ||= crypto.randomUUID();
          const created = await adminRequest("/api/posts", "POST", { ...input, draft: intent !== "publish" }, { "Idempotency-Key": creationKey.current });
          savedSlug = String(created.slug);
        } else {
          await adminRequest(`/api/posts/${item.slug}`, "PATCH", input);
          if (intent === "publish" && post?.status === "draft") await adminRequest(`/api/posts/${item.slug}/publish`, "POST");
        }
      } else {
        const slug = item?.slug || slugify(title);
        savedSlug = slug;
        await adminRequest(`/api/rules/${slug}`, "PUT", {
          title, body,
        }, item ? undefined : { "If-None-Match": "*" });
      }
      await adminRequest(`/api/tags/${news ? "post" : "rule"}/${savedSlug}`, "PUT", { tags: form.getAll("tags") });
      await navigate(`/admin/${section}?saved=1`);
    });
  }
  return <>
    <div className="mb-6"><Link to={`/admin/${section}`} className="underline text-sm">← Back to {news ? "newsfeed" : "rules"}</Link></div>
    <h1 className="text-3xl font-serif font-bold mb-2">{item ? "Edit" : "Add"} {news ? "news entry" : "operational rule"}</h1>
    {item && <p className="text-sm font-mono opacity-70 mb-6">{item.slug}</p>}
    <form className="admin-form mt-6" onSubmit={submit}>
      <fieldset disabled={task.pending} className="space-y-5">
        <label>Title<input name="title" defaultValue={item?.title || ""} required maxLength={120} /></label>
        <label>Body (Markdown)<textarea name="body" defaultValue={item?.body_md || ""} rows={20} className="font-mono text-sm" aria-describedby="body-help" /></label>
        <p id="body-help" className="text-xs opacity-70">Plain Markdown, up to 64 KiB.</p>
        <fieldset><legend>Tags</legend>{tags.map(tag => <label key={tag}><input type="checkbox" name="tags" value={tag} defaultChecked={selectedTags.includes(tag)} /> {tag}</label>)}</fieldset>
        <Failure error={task.error} />
        <div className="flex flex-wrap items-center gap-3">
          {news && post?.status !== "published" ? <>
            <button className="admin-button secondary" type="submit" value="draft">{task.pending ? "Saving…" : "Save draft"}</button>
            <button className="admin-button" type="submit" value="publish">Publish</button>
          </> : <button className="admin-button" type="submit" value="save">{task.pending ? "Saving…" : "Save changes"}</button>}
          <Link to={`/admin/${section}`} className="underline text-sm">Cancel</Link>
        </div>
      </fieldset>
    </form>
  </>;
}

function OrgEditor({ item }: { item: Rule | null }) {
  const task = useTask();
  const revalidator = useRevalidator();
  const [saved, setSaved] = useState(false);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm("Replace the current org chart with this file?")) return;
    const form = event.currentTarget;
    const body = new FormData(form);
    setSaved(false);
    await task.run(async () => {
      await adminRequest("/api/org", "PUT", body);
      form.reset(); setSaved(true);
      await revalidator.revalidate();
    });
  }
  return <>
    <h1 className="text-3xl font-serif font-bold mb-6">Org chart</h1>
    {<>
      <p className="mb-4">Upload a Markdown file containing the replacement Mermaid chart. Saving updates the existing org entry immediately.</p>
      <div className="flex flex-wrap gap-5 text-sm mb-8"><a href="/org.md" download="org.md" className="underline">Download current org.md</a><a href="/org" target="_blank" rel="noreferrer" className="underline">View org chart</a></div>
      <p className="text-xs font-mono opacity-70 mb-6">Last updated {item?.updated_at || "not yet uploaded"}</p>
      <form className="admin-form" onSubmit={upload}>
        <fieldset disabled={task.pending} className="space-y-5">
          <label>Replacement Markdown file<input name="file" type="file" accept=".md,text/markdown" required /></label>
          <p className="text-xs opacity-70">UTF-8 .md file, up to 64 KiB. A downloaded org.md can be edited and uploaded again.</p>
          <Failure error={task.error} />
          {saved && <p role="status">Org chart updated.</p>}
          <button className="admin-button">{task.pending ? "Uploading…" : "Upload replacement"}</button>
        </fieldset>
      </form>
    </>}
  </>;
}

function DirectoryEditor({ profiles, tags }: { profiles: {tag:string; body_md:string}[]; tags: string[] }) {
  const task = useTask(); const revalidator = useRevalidator();
  const [selected, setSelected] = useState("");
  const current = profiles.find(p => p.tag === selected);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const form = new FormData(e.currentTarget); const tag = String(form.get("tag"));
    await task.run(async () => { await adminRequest(`/api/agents/${tag}`, "PUT", {body: String(form.get("body"))}, current ? undefined : {"If-None-Match":"*"}); setSelected(tag); await revalidator.revalidate(); });
  }
  return <section className="mt-12 space-y-6"><h2 className="text-2xl font-serif font-bold">Agent profiles</h2>
    <div className="flex gap-3 flex-wrap"><button type="button" onClick={() => setSelected("")} className="underline">New agent</button>{profiles.map(p => <button type="button" className="underline" key={p.tag} onClick={() => setSelected(p.tag)}>{p.tag}</button>)}</div>
    <form key={selected} className="admin-form space-y-4" onSubmit={save}><label>Three-letter tag<input name="tag" required pattern="[A-Z]{3}" maxLength={3} defaultValue={selected} readOnly={!!current} /></label><label>Markdown description<textarea name="body" required rows={12} defaultValue={current?.body_md || ""} /></label><button className="admin-button" disabled={task.pending}>Save profile</button> {current && <button type="button" className="underline" onClick={() => { if (window.confirm(`Delete ${current.tag}?`)) void task.run(async () => { await adminRequest(`/api/agents/${current.tag}`, "DELETE"); setSelected(""); await revalidator.revalidate(); }); }}>Delete profile</button>}</form>
    <h2 className="text-2xl font-serif font-bold">Tags</h2><form className="admin-form flex gap-3" onSubmit={e => { e.preventDefault(); const form = e.currentTarget; const name = String(new FormData(form).get("name")); void task.run(async () => { await adminRequest("/api/tags", "POST", {name}); form.reset(); await revalidator.revalidate(); }); }}><label>New tag<input name="name" required maxLength={80}/></label><button className="admin-button">Create tag</button></form>
    <ul>{tags.map(tag => <li key={tag}>{tag} <button className="underline" type="button" onClick={() => { if (window.confirm(`Delete tag “${tag}” from all entries?`)) void task.run(async () => { await adminRequest(`/api/tags/${encodeURIComponent(tag)}`, "DELETE"); await revalidator.revalidate(); }); }}>Delete</button></li>)}</ul><Failure error={task.error}/>
  </section>;
}

export default function Admin() {
  const result = useLoaderData<typeof loader>() as AdminData;
  const task = useTask();
  const revalidator = useRevalidator();
  const [search] = useSearchParams();
  const { section, items, item } = result;
  return <Layout>
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-5 mb-8">
      <nav aria-label="Administration" className="flex flex-wrap gap-5 text-sm">
        {([['news', 'Newsfeed'], ['rules', 'Rules'], ['org', 'Org chart'], ['trash', 'Trash']] as const).map(([path, label]) =>
          <Link key={path} to={`/admin/${path}`} aria-current={section === path ? "page" : undefined} className={section === path ? "font-bold underline" : "hover:underline"}>{label}</Link>)}
      </nav>
      <button disabled={task.pending} className="text-sm underline" onClick={() => task.run(async () => { await adminRequest("/api/auth/logout", "POST"); window.location.assign("/login"); })}>Log out</button>
    </div>
    <Failure error={task.error} />
    {section === "org" ? <><OrgEditor item={item as Rule | null} /><DirectoryEditor profiles={result.profiles} tags={result.tags} /></> : result.editing && (section === "news" || section === "rules") ?
      <EntryEditor key={`${section}:${item?.slug || "new"}`} section={section} item={item} tags={result.tags} selectedTags={result.selectedTags} /> : <>
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <h1 className="text-3xl font-serif font-bold">{section === "news" ? "Newsfeed" : section === "rules" ? "Operational Rules" : "Trash"}</h1>
          {section !== "trash" && <Link to={`/admin/${section}/new`} className="admin-button">Add entry</Link>}
        </div>
        {search.has("saved") && <p role="status" className="mb-5">Entry saved.</p>}
        {section === "trash" && <p className="mb-6 text-sm opacity-70">Trashed entries are hidden publicly. Restore returns each entry to its previous publication status.</p>}
        {!items.length && <p className="opacity-70">{section === "trash" ? "Trash is empty." : "No entries on this page."}</p>}
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {items.map((entry) => <li key={`${entry.entity}:${entry.slug}`} className="py-5 flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 basis-64">
              {section === "trash" ? <p className="font-medium break-words">{entry.title}</p> : <Link className="font-medium underline break-words" to={`/admin/${section}/${entry.slug}/edit`}>{entry.title}</Link>}
              <p className="text-xs font-mono opacity-70 mt-2 break-words">{entry.entity === "post" && entry.status === "draft" ? "Draft" : ""}{entry.deleted_at ? ` · Trashed ${entry.deleted_at.slice(0, 10)}` : ""}</p>
            </div>
            <button className="text-sm underline disabled:opacity-50" disabled={task.pending} aria-label={`${section === "trash" ? "Restore" : "Trash"} ${entry.title}`} onClick={() => {
              if (section !== "trash" && !window.confirm(`Move “${entry.title}” to trash?`)) return;
              void task.run(async () => {
                await adminRequest(`/api/${entry.entity === "post" ? "posts" : "rules"}/${entry.slug}${section === "trash" ? "/restore" : ""}`, section === "trash" ? "POST" : "DELETE");
                await revalidator.revalidate();
              });
            }}>{section === "trash" ? "Restore" : "Move to trash"}</button>
          </li>)}
        </ul>
        <nav aria-label="Pagination" className="flex justify-between text-sm mt-8">
          {result.page > 1 ? <Link className="underline" to={`?page=${result.page - 1}`}>← Previous</Link> : <span />}
          <span>Page {result.page}</span>
          {result.more ? <Link className="underline" to={`?page=${result.page + 1}`}>Next →</Link> : <span />}
        </nav>
      </>}
  </Layout>;
}
