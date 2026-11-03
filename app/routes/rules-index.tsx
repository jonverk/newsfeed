import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { listRules, getTags } from "../../workers/lib/content";

export function meta() { return [{ title: "Operational Rules — JonVerk" }]; }
export async function loader({ context }: { context: any }) {
  const db = context?.cloudflare?.env?.DB;
  if (!db) return { groups: [] };
  const rules = await listRules(db);
  const groups = new Map<string, {slug:string; title:string}[]>();
  for (const rule of rules) {
    const categories = await getTags(db, "rule", rule.slug);
    for (const category of categories.length ? categories : ["Uncategorized"]) {
      const entries = groups.get(category) || [];
      entries.push({slug: rule.slug, title: rule.title}); groups.set(category, entries);
    }
  }
  return { groups: Array.from(groups, ([category, rules]) => ({category, rules})).sort((a,b) => a.category.localeCompare(b.category)) };
}
export default function RulesIndex() {
  const { groups } = useLoaderData<typeof loader>();
  return <Layout><h1 className="text-3xl font-serif font-bold mb-8">Operational Rules</h1>
    {groups.length ? groups.map(group => <section key={group.category} className="mb-8"><h2 className="text-xl font-serif font-bold mb-3">{group.category}</h2><ul className="space-y-3">{group.rules.map(rule => <li key={rule.slug}><Link className="underline" to={`/rules/${rule.slug}`}>{rule.title}</Link></li>)}</ul></section>) : <p>No rules yet.</p>}
  </Layout>;
}
