import React from "react";

export function Markdown({ html }: { html: string }) {
	return (
		<div
			className="prose dark:prose-invert max-w-none leading-relaxed text-neutral-800 dark:text-neutral-200"
			dangerouslySetInnerHTML={{ __html: html }}
		/>
	);
}
