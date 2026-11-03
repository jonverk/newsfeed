import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { Markdown } from "../components/Markdown";
import { getRule, getRuleById } from "../../workers/lib/content";
import { getTags } from "../../workers/lib/content";
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

	const html = renderMarkdown(rule.body_md);
	return { rule: {slug: rule.slug, title: rule.title}, html, tags: await getTags(db, "rule", slug) };
}

export default function RuleDetail() {
	const { rule, html, tags } = useLoaderData<typeof loader>();

	return (
		<Layout>
			<article className="max-w-2xl mx-auto">
				<div className="mb-6">
					<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
						{rule.title}
					</h1>
				</div>

				<p className="text-sm opacity-70">{tags.join(" · ")} <a href={`/rules/${rule.slug}.md`} className="underline">View Markdown source</a></p>
				<div className="py-6 border-t border-neutral-200 dark:border-neutral-800">
					<Markdown html={html} />
				</div>

			</article>
		</Layout>
	);
}
