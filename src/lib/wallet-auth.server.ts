import { createClient } from "@supabase/supabase-js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// The packaged Android/iOS app loads its screens locally and calls these
// routes cross-origin from capacitor://localhost (Android) or
// capacitor://localhost / https://localhost (iOS). Only those app origins get
// CORS headers; browser traffic stays same-origin and needs none.
const APP_ORIGINS = new Set(["capacitor://localhost", "https://localhost", "http://localhost"]);

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  if (!APP_ORIGINS.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    vary: "origin",
  };
}

export const json = (body: unknown, status = 200, request?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(request ? corsHeaders(request) : {}) },
  });

export function errorResponse(e: unknown, request?: Request) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status, request);
  console.error("[wallet]", e);
  return json({ error: "Something went wrong. Please try again." }, 500, request);
}

export const corsPreflightResponse = (request: Request) =>
  new Response(null, { status: 204, headers: corsHeaders(request) });

/** Verifies the bearer token with the auth service and returns the user id. Never trusts client-supplied ids. */
export async function requireUser(request: Request): Promise<string> {
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token.split(".").length !== 3) throw new HttpError(401, "Please sign in again.");
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Please sign in again.");
  return data.user.id;
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}
