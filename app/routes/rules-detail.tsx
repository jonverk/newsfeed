import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { Markdown } from "../components/Markdown";
import { getRule, getRuleById } from "../../workers/lib/content";
import { renderMarkdown } from "../../workers/lib/render";

export function meta({ data }: { data: any }) {
	if (!data?.rule) {
		return [{ title: "Rule Not Found" }];
	}
	return [
		{ title: `${data.rule.title} — JonVerk Operational Rules` },
		{ name: "description", content: data.rule.title },
	];
}

export async function loader({ params, context }: { params: { slug?: string }; context: any }) {
	const db = context?.cloudflare?.env?.DB;
	const slug = params.slug;
	if (!db || !slug) {
		throw new Response("Not found", { status: 404 });
	}
	const rule = await getRule(db, slug);
	if (!rule || rule.status === "draft") {
		throw new Response("Not found", { status: 404 });
	}

	let replacementRule: { slug: string; rule_id: string; title: string } | null = null;
	if (rule.status === "superseded" && rule.superseded_by) {
		const rep = await getRuleById(db, rule.superseded_by);
		if (rep) {
			replacementRule = { slug: rep.slug, rule_id: rep.rule_id, title: rep.title };
		}
	}

	const html = renderMarkdown(rule.body_md);
	return { rule, replacementRule, html };
}

export default function RuleDetail() {
	const { rule, replacementRule, html } = useLoaderData<typeof loader>();
	const isSuperseded = rule.status === "superseded";

	return (
		<Layout>
			<article className="max-w-2xl mx-auto">
				<div className="mb-6">
					<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
						{rule.title}
					</h1>
				</div>

				{isSuperseded && (
					<div className="mb-8 p-4 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-sm text-amber-900 dark:text-amber-200">
						<div className="font-semibold flex items-center gap-2">
							<span className="font-mono uppercase text-xs px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
								Superseded Policy
							</span>
							<span>This rule has been superseded.</span>
						</div>
						<p className="mt-2 text-xs">
							Showing the historical text for compliance reference.
							{rule.superseded_by && (
								<>
									{" "}Active successor:{" "}
									{replacementRule ? (
										<Link to={`/rules/${replacementRule.slug}`} className="font-mono font-semibold underline">
											{replacementRule.title} &rarr;
										</Link>
									) : (
										<span className="font-mono font-semibold">Replacement unavailable</span>
									)}
								</>
							)}
						</p>
					</div>
				)}

				<div className="py-6 border-t border-neutral-200 dark:border-neutral-800">
					<Markdown html={html} />
				</div>

			</article>
		</Layout>
	);
}
