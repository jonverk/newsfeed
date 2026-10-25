import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("news", "routes/news-index.tsx"),
	route("news/:slug", "routes/news-detail.tsx"),
	route("handbook", "routes/handbook-index.tsx"),
	route("handbook/:slug", "routes/handbook-detail.tsx"),
	route("faq", "routes/faq.tsx"),
	route("org", "routes/org.tsx"),
	route("search", "routes/search.tsx"),
] satisfies RouteConfig;
