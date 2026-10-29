import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { listPublishedPosts, listRules } from "../../workers/lib/content";
import { deriveSummary } from "../../workers/lib/render";

export function meta() {
	return [
		{ title: "JonVerk — Newsfeed & Operational Rules" },
		{ name: "description", content: "Operational updates, decisions, and system notices." },
	];
}

export async function loader({ context }: { context: any }) {
	const db = context?.cloudflare?.env?.DB;
	if (!db) {
		return { posts: [], rules: [] };
	}
	const [posts, rules] = await Promise.all([
		listPublishedPosts(db, { limit: 10 }),
		listRules(db, { statuses: ["active"] }),
	]);
	const postItems = posts.map((p) => ({
		id: p.id,
		slug: p.slug,
		title: p.title,
		kind: p.kind,
		author: p.author,
		published_at: p.published_at || p.created_at,
		summary: deriveSummary(p.body_md),
	}));
	return { posts: postItems, rules };
}

export default function Home() {
	const { posts, rules } = useLoaderData<typeof loader>();

	return (
		<Layout>
			<section className="mb-12">
				<form action="/search" method="get" className="flex gap-2">
					<input
						type="search"
						name="q"
						placeholder="Search the newsfeed and operational rules..."
						className="flex-1 px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-500"
					/>
					<button
						type="submit"
						className="px-4 py-2 text-sm font-medium rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 cursor-pointer"
					>
						Search
					</button>
				</form>
			</section>

			<section className="mb-16">
				<div className="flex items-baseline justify-between mb-6 pb-2 border-b border-neutral-200 dark:border-neutral-800">
					<h2 className="text-xl font-serif font-bold text-neutral-900 dark:text-neutral-100">
						Recent Newsfeed Entries
					</h2>
					<Link to="/news" className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:underline">
						View archive &rarr;
					</Link>
				</div>

				{posts.length === 0 ? (
					<p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No published newsfeed entries yet.</p>
				) : (
					<div className="space-y-8">
						{posts.map((post) => (
							<article key={post.slug} className="group">
								<h3 className="text-lg font-serif font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
									<Link to={`/news/${post.slug}`}>{post.title}</Link>
								</h3>
								<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400 line-clamp-2">
									{post.summary}
								</p>
							</article>
						))}
					</div>
				)}
			</section>

			<section>
				<div className="flex items-baseline justify-between mb-6 pb-2 border-b border-neutral-200 dark:border-neutral-800">
					<h2 className="text-xl font-serif font-bold text-neutral-900 dark:text-neutral-100">
						Operational Rules
					</h2>
					<Link to="/rules" className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:underline">
						All rules &rarr;
					</Link>
				</div>

				{rules.length === 0 ? (
					<p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No active operational rules yet.</p>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{rules.slice(0, 8).map((rule) => (
							<Link
								key={rule.rule_id}
								to={`/rules/${rule.slug}`}
								className="block p-3 rounded border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 bg-white/50 dark:bg-neutral-900/50"
							>
								<div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
									{rule.title}
								</div>
							</Link>
						))}
					</div>
				)}
			</section>
		</Layout>
	);
}
