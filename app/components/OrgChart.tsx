import React, { useEffect, useRef } from "react";

export function OrgChart({ source }: { source: string }) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (typeof window === "undefined") return;
		if (!navigator.onLine) return;
		if (window.matchMedia && !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;

		let mounted = true;
		import("https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs" as any)
			.then((mermaid) => {
				if (!mounted) return;
				mermaid.default.initialize({
					startOnLoad: false,
					theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "neutral",
				});
				mermaid.default.run({
					nodes: containerRef.current?.querySelectorAll(".mermaid"),
				}).catch((e: unknown) => {
					console.warn("Mermaid rendering fallback to pre:", e);
				});
			})
			.catch(() => {
				// Silently leave <pre> intact on CDN failure
			});

		return () => {
			mounted = false;
		};
	}, [source]);

	return (
		<div ref={containerRef} className="my-6 overflow-x-auto rounded border border-neutral-200 dark:border-neutral-800 p-4 bg-neutral-50 dark:bg-neutral-900">
			<pre className="mermaid font-mono text-sm leading-relaxed text-neutral-800 dark:text-neutral-200 whitespace-pre">
				{source}
			</pre>
		</div>
	);
}
