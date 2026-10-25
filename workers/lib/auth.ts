import type { AppEnv } from "./env";

async function sha256(s: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

export async function requireToken(request: Request, env: AppEnv): Promise<Response | null> {
  const token = env.NEWSFEED_TOKEN;
  if (!token || token.trim() === "") {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const auth = (request.headers.get("authorization") || "").trim();
  const match = auth.match(/^bearer\s+(.+)$/i);
  if (!match) {
    return new Response(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  const a = await sha256(match[1].trim());
  const b = await sha256(token.trim());
  if (constantTimeEqual(a, b)) {
    return null;
  }
  return new Response(JSON.stringify({ message: "Unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}
