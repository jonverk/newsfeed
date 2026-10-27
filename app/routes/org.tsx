import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { OrgChart } from "../components/OrgChart";
import { getOrgRule } from "../../workers/lib/content";

export function meta() {
	return [
		{ title: "Organization Chart (ORG-001) — JonVerk" },
		{ name: "description", content: "Canonical organization hierarchy and team structure." },
	];
}

export async function loader({ context }: { context: any }) {
	const db = context?.cloudflare?.env?.DB;
	if (!db) throw new Response("Not found", { status: 404 });
	const rule = await getOrgRule(db);
	if (!rule) throw new Response("Not found", { status: 404 });

	const match = rule.body_md.match(/```mermaid\s*([\s\S]*?)```/);
	const mermaidSource = match ? match[1].trim() : rule.body_md;

	return { rule, mermaidSource };
}

export default function Org() {
	const { rule, mermaidSource } = useLoaderData<typeof loader>();

	return (
		<Layout>
			<div className="mb-6">
				<div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 font-mono mb-2">
					<span className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold">
						{rule.rule_id}
					</span>
					<span>&middot;</span>
					<span>Owner: {rule.owner || "Jon"}</span>
					<span>&middot;</span>
					<a href="/org.mmd" className="underline hover:text-neutral-900 dark:hover:text-neutral-100">
						raw .mmd
					</a>
					<span>&middot;</span>
					<a href="/org.md" className="underline hover:text-neutral-900 dark:hover:text-neutral-100">
						raw .md
					</a>
				</div>
				<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
					{rule.title}
				</h1>
				<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
					Current team topology and reporting relationships rendered from canonical Mermaid source.
				</p>
			</div>

			<OrgChart source={mermaidSource} />

			<div className="mt-12 pt-6 border-t border-neutral-200 dark:border-neutral-800 text-xs font-mono text-neutral-500 dark:text-neutral-400 flex flex-col sm:flex-row justify-between gap-2">
				<div>
					<span>Canonical: </span>
					<span className="text-neutral-700 dark:text-neutral-300">/org</span>
				</div>
				<div className="flex gap-4">
					<a href="/org.md" className="underline hover:text-neutral-900 dark:hover:text-neutral-100">
						/org.md
					</a>
					<a href="/org.mmd" className="underline hover:text-neutral-900 dark:hover:text-neutral-100">
						/org.mmd
					</a>
				</div>
			</div>
		</Layout>
	);
}
