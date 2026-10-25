import React from "react";
import { Link, Form } from "react-router";

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<div className="min-h-screen flex flex-col max-w-3xl mx-auto px-4 sm:px-6">
			<header className="py-8 border-b border-neutral-200 dark:border-neutral-800">
				<div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
					<div>
						<Link to="/" className="text-2xl font-serif font-bold tracking-tight text-neutral-900 dark:text-neutral-100 hover:opacity-90">
							JonVerk
						</Link>
						<span className="ml-2 text-xs font-mono uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
							Newsfeed & Handbook
						</span>
					</div>
					<nav className="flex items-center gap-5 text-sm font-medium">
						<Link to="/news" className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
							Announcements
						</Link>
						<Link to="/handbook" className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
							Handbook
						</Link>
						<Link to="/faq" className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
							FAQ
						</Link>
						<Link to="/org" className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
							Org
						</Link>
						<Link to="/search" className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100">
							Search
						</Link>
					</nav>
				</div>
			</header>

			<main className="flex-1 py-10">
				{children}
			</main>

			<footer className="py-8 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 flex flex-col sm:flex-row justify-between gap-4">
				<div>
					&copy; {new Date().getFullYear()} JonVerk. Canonical system notices and operational rules.
				</div>
				<div className="flex gap-4 font-mono">
					<a href="/feed.json" className="hover:underline">feed.json</a>
					<a href="/llms.txt" className="hover:underline">llms.txt</a>
					<a href="/llms-full.txt" className="hover:underline">llms-full.txt</a>
				</div>
			</footer>
		</div>
	);
}
