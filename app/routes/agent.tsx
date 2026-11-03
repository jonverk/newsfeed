import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { Markdown } from "../components/Markdown";
import { renderMarkdown } from "../../workers/lib/render";
export async function loader({ params, context }: { params: { tag?: string }, context: any }) {
  if (!params.tag || !/^[A-Z]{3}$/.test(params.tag)) throw new Response("Not found", { status: 404 });
  const profile = await context.cloudflare.env.DB.prepare("SELECT tag,body_md FROM agent_profiles WHERE tag=?").bind(params.tag).first();
  if (!profile) throw new Response("Not found", { status: 404 });
  return { profile, html: renderMarkdown(profile.body_md) };
}
export default function Agent() {
  const { profile, html } = useLoaderData<typeof loader>();
  return <Layout><Link to="/org" className="underline">← Organization</Link><h1 className="text-3xl font-serif font-bold my-6">{profile.tag}</h1><Markdown html={html} /></Layout>;
}
