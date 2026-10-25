import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { listPublishedPosts, listRules } from "../../workers/lib/content";
import { deriveSummary } from "../../workers/lib/render";

export function meta() {
	return [
		{ title: "JonVerk — Newsfeed & Operational Handbook" },
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

function KindBadge({ kind }: { kind: string }) {
	if (kind === "kudos") {
		return <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">kudos</span>;
	}
	if (kind === "milestone") {
		return <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">milestone</span>;
	}
	return <span className="text-xs px-2 py-0.5 rounded font-mono font-medium bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">notice</span>;
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
						placeholder="Search announcements and handbook rules..."
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
						Recent Announcements
					</h2>
					<Link to="/news" className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:underline">
						View archive &rarr;
					</Link>
				</div>

				{posts.length === 0 ? (
					<p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No published announcements yet.</p>
				) : (
					<div className="space-y-8">
						{posts.map((post) => (
							<article key={post.slug} className="group">
								<div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 mb-1 font-mono">
									<time dateTime={post.published_at}>{post.published_at ? new Date(post.published_at).toISOString().split("T")[0] : ""}</time>
									<span>&middot;</span>
									<KindBadge kind={post.kind} />
									<span>&middot;</span>
									<span>{post.author}</span>
								</div>
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
						Operational Handbook & FAQ
					</h2>
					<Link to="/handbook" className="text-xs font-mono text-neutral-500 dark:text-neutral-400 hover:underline">
						All rules &rarr;
					</Link>
				</div>

				{rules.length === 0 ? (
					<p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No active handbook rules seeded yet.</p>
				) : (
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{rules.slice(0, 8).map((rule) => (
							<Link
								key={rule.rule_id}
								to={`/handbook/${rule.slug}`}
								className="block p-3 rounded border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 bg-white/50 dark:bg-neutral-900/50"
							>
								<div className="flex items-center gap-2 mb-1">
									<span className="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
										{rule.rule_id}
									</span>
									<span className="text-xs text-neutral-500 dark:text-neutral-400 font-mono capitalize">
										{rule.category}
									</span>
								</div>
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
