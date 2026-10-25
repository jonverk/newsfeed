import React from "react";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { Layout } from "../components/Layout";
import { searchContent, type SearchHit } from "../../workers/lib/search";

export function meta() {
	return [
		{ title: "Search — JonVerk Newsfeed" },
		{ name: "description", content: "Search across announcements and handbook rules." },
	];
}

export async function loader({ request, context }: { request: Request; context: any }) {
	const db = context?.cloudflare?.env?.DB;
	const url = new URL(request.url);
	const q = url.searchParams.get("q") || "";
	const kind = url.searchParams.get("kind") as "post" | "rule" | undefined;

	if (!db || !q.trim()) {
		return { q, hits: [] };
	}

	const hits = await searchContent(db, q, kind);
	return { q, hits };
}

export default function Search() {
	const { q, hits } = useLoaderData<typeof loader>();
	const [searchParams] = useSearchParams();

	return (
		<Layout>
			<div className="mb-8 pb-4 border-b border-neutral-200 dark:border-neutral-800">
				<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100">
					Search Content
				</h1>
			</div>

			<form method="get" action="/search" className="flex gap-2 mb-8">
				<input
					type="search"
					name="q"
					defaultValue={q}
					placeholder="Search posts, rules, procedures..."
					className="flex-1 px-3 py-2 text-sm rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-500"
				/>
				<button
					type="submit"
					className="px-4 py-2 text-sm font-medium rounded bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-90 cursor-pointer"
				>
					Search
				</button>
			</form>

			{q.trim() && (
				<div className="mb-6 text-xs font-mono text-neutral-500 dark:text-neutral-400">
					Found {hits.length} result{hits.length === 1 ? "" : "s"} for &ldquo;{q}&rdquo;
				</div>
			)}

			<div className="space-y-6">
				{hits.map((hit) => (
					<article key={`${hit.kind}-${hit.slug}`} className="p-4 rounded border border-neutral-200 dark:border-neutral-800 bg-white/40 dark:bg-neutral-900/40">
						<div className="flex items-center gap-2 text-xs font-mono text-neutral-500 dark:text-neutral-400 mb-1">
							<span className="uppercase px-1.5 py-0.2 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
								{hit.kind}
							</span>
							<span>&middot;</span>
							<Link to={hit.url} className="text-blue-600 dark:text-blue-400 hover:underline">
								{hit.url}
							</Link>
						</div>
						<h2 className="text-lg font-serif font-semibold text-neutral-900 dark:text-neutral-100 mb-1">
							<Link to={hit.url} className="hover:underline">
								{hit.title}
							</Link>
						</h2>
						{hit.snippet && (
							<div
								className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed font-sans [&>mark]:bg-amber-200 dark:[&>mark]:bg-amber-900/60 dark:[&>mark]:text-amber-100"
								dangerouslySetInnerHTML={{ __html: hit.snippet }}
							/>
						)}
					</article>
				))}
			</div>
		</Layout>
	);
}
