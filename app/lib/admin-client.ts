export class AdminRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function adminRequest(path: string, method: string, body?: Record<string, unknown> | FormData, headers?: HeadersInit): Promise<Record<string, unknown>> {
  const requestHeaders = new Headers(headers);
  const upload = body instanceof FormData;
  if (body && !upload) requestHeaders.set("Content-Type", "application/json");
  const response = await fetch(path, {
    method, credentials: "same-origin", headers: requestHeaders,
    body: body ? upload ? body : JSON.stringify(body) : undefined,
  });
  const decoded: unknown = await response.json().catch(() => ({}));
  const result = decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded as Record<string, unknown> : {};
  if (!response.ok) throw new AdminRequestError(typeof result.message === "string" ? result.message : "The request failed. Please try again.", response.status);
  return result;
}
