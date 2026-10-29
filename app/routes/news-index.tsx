import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { listPublishedPosts } from "../../workers/lib/content";
import { deriveSummary } from "../../workers/lib/render";

export function meta() {
	return [
		{ title: "Newsfeed Archive — JonVerk Newsfeed" },
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

export default function NewsIndex() {
	const { posts } = useLoaderData<typeof loader>();

	return (
		<Layout>
			<div className="mb-8 pb-4 border-b border-neutral-200 dark:border-neutral-800">
				<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100">
					Newsfeed
				</h1>
				<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
					Chronological updates, milestone completions, and operational decisions.
				</p>
			</div>

			{posts.length === 0 ? (
				<p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No newsfeed entries published yet.</p>
			) : (
				<div className="space-y-10">
					{posts.map((post) => (
						<article key={post.slug} className="group">
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
