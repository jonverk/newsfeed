async function sha256Hex(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function etagFor(body: string, updatedAt?: string): Promise<string> {
  const h = await sha256Hex(updatedAt ? body + updatedAt : body);
  return `"` + h.slice(0, 16) + `"`;
}

export async function conditionalResponse(
  request: Request,
  body: string,
  init: { contentType: string; updatedAt?: string; headers?: HeadersInit }
): Promise<Response> {
  const etag = await etagFor(body, init.updatedAt);
  const headers = new Headers(init.headers || {});
  headers.set("ETag", etag);
  if (init.updatedAt) {
    headers.set("Last-Modified", new Date(init.updatedAt).toUTCString());
  }
  headers.set("Cache-Control", headers.get("Cache-Control") || "public, no-cache");

  const ifNone = request.headers.get("if-none-match");
  if (ifNone && ifNone.includes(etag)) {
    return new Response(null, { status: 304, headers });
  }

  headers.set("Content-Type", init.contentType);
  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(body, { status: 200, headers });
}
