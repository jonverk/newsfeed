import { useState, type FormEvent } from "react";
import { data, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import type { AppEnv } from "../../workers/lib/env";
import { browserUser } from "../../workers/lib/auth";
import { adminHeaders } from "../../workers/lib/admin";
import { adminRequest } from "../lib/admin-client";
import { Layout } from "../components/Layout";

export const meta = () => [{ title: "Log in — JonVerk" }];
export const headers = () => adminHeaders;
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as AppEnv;
  if (await browserUser(request, env)) return redirect("/admin/news", { headers: adminHeaders });
  return data({}, { headers: adminHeaders });
}

export default function Login() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true); setError("");
    try {
      await adminRequest("/api/auth/login", "POST", { username: String(form.get("username")), password: String(form.get("password")) });
      window.location.assign("/admin/news");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to log in."); setPending(false); }
  }
  return <Layout>
    <div className="max-w-sm mx-auto">
      <h1 className="text-3xl font-serif font-bold mb-8">Log in</h1>
      <form className="admin-form" onSubmit={submit}>
        <label>Username<input name="username" autoComplete="username" required autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p role="alert" className="admin-error">{error}</p>}
        <button className="admin-button" disabled={pending}>{pending ? "Logging in…" : "Log in"}</button>
      </form>
    </div>
  </Layout>;
}
