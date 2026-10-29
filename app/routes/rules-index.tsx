import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { listRules } from "../../workers/lib/content";

export function meta() { return [{ title: "Operational Rules — JonVerk" }]; }
export async function loader({ context }: { context: any }) {
  const db = context?.cloudflare?.env?.DB;
  return { rules: db ? await listRules(db, { statuses: ["active"] }) : [] };
}
export default function RulesIndex() {
  const { rules } = useLoaderData<typeof loader>();
  return <Layout><h1 className="text-3xl font-serif font-bold mb-8">Operational Rules</h1>
    {rules.length ? <ul className="space-y-3">{rules.map(rule => <li key={rule.slug}><Link className="underline" to={`/rules/${rule.slug}`}>{rule.title}</Link></li>)}</ul> : <p>No rules yet.</p>}
  </Layout>;
}
