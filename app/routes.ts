import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("login", "routes/login.tsx"),
	route("admin/*", "routes/admin.tsx"),
	route("news", "routes/news-index.tsx"),
	route("news/:slug", "routes/news-detail.tsx"),
	route("rules", "routes/rules-index.tsx"),
	route("rules/:slug", "routes/rules-detail.tsx"),
	route("org", "routes/org.tsx"),
	route("search", "routes/search.tsx"),
] satisfies RouteConfig;
