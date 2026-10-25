import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { listPublishedPosts } from "../../workers/lib/content";
import { deriveSummary } from "../../workers/lib/render";

export function meta() {
	return [
		{ title: "Announcements Archive — JonVerk Newsfeed" },
		{ name: "description", content: "Chronological log of operational updates and notices." },
	];
}

export async function loader({ context }: { context: any }) {
	const db = context?.cloudflare?.env?.DB;
	if (!db) return { posts: [] };
	const posts = await listPublishedPosts(db, { limit: 100 });
	return {
		posts: posts.map((p) => ({
			id: p.id,
			slug: p.slug,
			title: p.title,
			kind: p.kind,
			author: p.author,
			published_at: p.published_at || p.created_at,
			summary: deriveSummary(p.body_md),
		})),
	};
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

export default function NewsIndex() {
	const { posts } = useLoaderData<typeof loader>();

	return (
		<Layout>
			<div className="mb-8 pb-4 border-b border-neutral-200 dark:border-neutral-800">
				<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100">
					Announcements
				</h1>
				<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
					Chronological updates, milestone completions, and operational decisions.
				</p>
			</div>

			{posts.length === 0 ? (
				<p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No announcements published yet.</p>
			) : (
				<div className="space-y-10">
					{posts.map((post) => (
						<article key={post.slug} className="group">
							<div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 mb-1 font-mono">
								<time dateTime={post.published_at}>{post.published_at ? new Date(post.published_at).toISOString().split("T")[0] : ""}</time>
								<span>&middot;</span>
								<KindBadge kind={post.kind} />
								<span>&middot;</span>
								<span>{post.author}</span>
								<span>&middot;</span>
								<a href={`/news/${post.slug}.md`} className="hover:underline font-mono text-neutral-400">.md</a>
							</div>
							<h2 className="text-xl font-serif font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-blue-600 dark:group-hover:text-blue-400">
								<Link to={`/news/${post.slug}`}>{post.title}</Link>
							</h2>
							<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
								{post.summary}
							</p>
						</article>
					))}
				</div>
			)}
		</Layout>
	);
}
