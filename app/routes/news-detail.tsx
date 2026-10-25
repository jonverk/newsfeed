import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { Markdown } from "../components/Markdown";
import { getPublishedPost } from "../../workers/lib/content";
import { renderMarkdown } from "../../workers/lib/render";

export function meta({ data }: { data: any }) {
	if (!data?.post) {
		return [{ title: "Post Not Found" }];
	}
	return [
		{ title: `${data.post.title} — JonVerk Newsfeed` },
		{ name: "description", content: data.post.title },
	];
}

export async function loader({ params, context }: { params: { slug?: string }; context: any }) {
	const db = context?.cloudflare?.env?.DB;
	const slug = params.slug;
	if (!db || !slug) {
		throw new Response("Not found", { status: 404 });
	}
	const post = await getPublishedPost(db, slug);
	if (!post) {
		throw new Response("Not found", { status: 404 });
	}
	const html = renderMarkdown(post.body_md);
	return { post, html };
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

export default function NewsDetail() {
	const { post, html } = useLoaderData<typeof loader>();

	return (
		<Layout>
			<article className="max-w-2xl mx-auto">
				<div className="mb-6">
					<div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400 font-mono mb-2">
						<time dateTime={post.published_at || post.created_at}>
							{post.published_at ? new Date(post.published_at).toISOString().split("T")[0] : ""}
						</time>
						<span>&middot;</span>
						<KindBadge kind={post.kind} />
						<span>&middot;</span>
						<span>Author: {post.author}</span>
					</div>
					<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
						{post.title}
					</h1>
				</div>

				<div className="py-6 border-t border-neutral-200 dark:border-neutral-800">
					<Markdown html={html} />
				</div>

				<div className="mt-12 pt-6 border-t border-neutral-200 dark:border-neutral-800 text-xs font-mono text-neutral-500 dark:text-neutral-400 flex flex-col sm:flex-row justify-between gap-2">
					<div>
						<span>Canonical: </span>
						<span className="text-neutral-700 dark:text-neutral-300">/news/{post.slug}</span>
					</div>
					<div>
						<span>Raw: </span>
						<a href={`/news/${post.slug}.md`} className="underline hover:text-neutral-900 dark:hover:text-neutral-100">
							/news/{post.slug}.md
						</a>
					</div>
				</div>
			</article>
		</Layout>
	);
}
