import React from "react";
import { Link, useLoaderData } from "react-router";
import { Layout } from "../components/Layout";
import { listRules, type Rule } from "../../workers/lib/content";

export function meta() {
	return [
		{ title: "Operational Handbook & FAQ — JonVerk" },
		{ name: "description", content: "Canonical rules, procedures, and architectural references." },
	];
}

export async function loader({ context }: { context: any }) {
	const db = context?.cloudflare?.env?.DB;
	if (!db) return { rules: [] };
	const rules = await listRules(db, { statuses: ["active", "superseded"] });
	return { rules };
}

const CATEGORY_NAMES: Record<string, string> = {
	rules: "Core Rules",
	org: "Organization & Structure",
	logging: "Logging & Observability",
	verification: "Verification & Quality Gates",
	process: "Operational Processes",
	faq: "Frequently Asked Questions (FAQ)",
	other: "Miscellaneous Policies",
};

export default function HandbookIndex() {
	const { rules } = useLoaderData<typeof loader>();

	// Group rules by category
	const grouped = rules.reduce<Record<string, Rule[]>>((acc, rule) => {
		const cat = rule.category || "other";
		if (!acc[cat]) acc[cat] = [];
		acc[cat].push(rule);
		return acc;
	}, {});

	const categories = Object.keys(CATEGORY_NAMES).filter((cat) => grouped[cat]?.length > 0);

	return (
		<Layout>
			<div className="mb-8 pb-4 border-b border-neutral-200 dark:border-neutral-800">
				<h1 className="text-3xl font-serif font-bold text-neutral-900 dark:text-neutral-100">
					Operational Handbook & FAQ
				</h1>
				<p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
					Structured operational rules, verification requirements, and policies.
				</p>
			</div>

			{rules.length === 0 ? (
				<p className="text-sm text-neutral-500 dark:text-neutral-400 italic">No handbook rules seeded yet.</p>
			) : (
				<div className="space-y-12">
					{categories.map((cat) => (
						<section key={cat}>
							<h2 className="text-lg font-serif font-semibold text-neutral-900 dark:text-neutral-100 mb-4 pb-1 border-b border-neutral-200 dark:border-neutral-800">
								{CATEGORY_NAMES[cat] || cat}
							</h2>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								{grouped[cat].map((rule) => {
									const isSuperseded = rule.status === "superseded";
									return (
										<Link
											key={rule.rule_id}
											to={`/handbook/${rule.slug}`}
											className={`p-3 rounded border transition-colors flex items-start justify-between gap-3 ${
												isSuperseded
													? "border-neutral-200 dark:border-neutral-800 bg-neutral-100/50 dark:bg-neutral-900/20 opacity-75"
													: "border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 dark:hover:border-neutral-600 bg-white dark:bg-neutral-900"
											}`}
										>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 mb-1">
													<span className="font-mono text-xs px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-semibold">
														{rule.rule_id}
													</span>
													{isSuperseded && (
														<span className="text-[10px] font-mono px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 uppercase">
															Superseded
														</span>
													)}
												</div>
												<div className="text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">
													{rule.title}
												</div>
											</div>
											<span className="text-xs font-mono text-neutral-400 shrink-0">
												{rule.effective_at ? new Date(rule.effective_at).toISOString().split("T")[0] : ""}
											</span>
										</Link>
									);
								})}
							</div>
						</section>
					))}
				</div>
			)}
		</Layout>
	);
}
