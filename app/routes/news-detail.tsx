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

export default function NewsDetail() {
	const { post, html } = useLoaderData<typeof loader>();

	return (
		<Layout>
			<article className="max-w-2xl mx-auto">
				<div className="mb-6">
					<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100 leading-tight">
						{post.title}
					</h1>
				</div>

				<div className="py-6 border-t border-neutral-200 dark:border-neutral-800">
					<Markdown html={html} />
				</div>

			</article>
		</Layout>
	);
}
