async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function etagFor(body: string, updatedAt: string): Promise<string> {
  const h = await sha256Hex(body + updatedAt);
  return `"` + h.slice(0, 16) + `"`;
}

export async function conditionalResponse(
  request: Request,
  body: string,
  init: { contentType: string; updatedAt: string }
): Promise<Response> {
  const etag = await etagFor(body, init.updatedAt);
  const lastMod = new Date(init.updatedAt).toUTCString();
  const ifNone = request.headers.get("if-none-match");
  if (ifNone && ifNone.includes(etag)) {
    const headers = new Headers();
    headers.set("ETag", etag);
    headers.set("Last-Modified", lastMod);
    headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    if (request.method === "HEAD") {
      return new Response(null, { status: 304, headers });
    }
    return new Response(null, { status: 304, headers });
  }
  const headers = new Headers(init.headers || {});
  headers.set("Content-Type", init.contentType);
  headers.set("ETag", etag);
  headers.set("Last-Modified", lastMod);
  headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(body, { status: 200, headers });
}
