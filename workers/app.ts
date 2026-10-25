import { Hono } from "hono";
import { createRequestHandler } from "react-router";
import type { AppEnv } from "./lib/env";
import { api } from "./api/app";

const app = new Hono<{ Bindings: AppEnv }>();

// Mount the API and surface endpoints
app.route("/", api);

app.get("*", (c) => {
	const requestHandler = createRequestHandler(
		() => import("virtual:react-router/server-build"),
		import.meta.env.MODE,
	);

	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx },
	});
});

export default app;
