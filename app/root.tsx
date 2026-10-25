import {
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
	{ rel: "preconnect", href: "https://fonts.googleapis.com" },
	{
		rel: "preconnect",
		href: "https://fonts.gstatic.com",
		crossOrigin: "anonymous",
	},
	{
		rel: "stylesheet",
		href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=JetBrains+Mono:wght@400;500;600&display=swap",
	},
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body className="antialiased min-h-screen">
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = "Oops!";
	let details = "An unexpected error occurred.";

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? "404 — Not Found" : "Error";
		details =
			error.status === 404
				? "The requested page does not exist."
				: error.statusText || details;
	} else if (error && error instanceof Error) {
		details = error.message;
	}

	return (
		<main className="max-w-3xl mx-auto px-4 py-16">
			<h1 className="text-3xl font-serif font-bold text-red-600 dark:text-red-400 mb-4">{message}</h1>
			<p className="text-neutral-600 dark:text-neutral-400 mb-6">{details}</p>
			<a href="/" className="inline-block text-sm font-medium underline text-blue-600 dark:text-blue-400">
				&larr; Return to newsfeed
			</a>
		</main>
	);
}
