import { createChallengeResponse, resolveSecret, verifyChallenge, verifyToken } from "./challenge-api.js";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

// Per-IP rate limit via the Workers native rate-limiting binding (env.API_RATE_LIMIT).
// Returns true when the request is allowed. If the binding isn't present (local dev,
// tests), it fails open so nothing breaks.
async function allowRequest(request, env) {
  if (!env.API_RATE_LIMIT?.limit) return true;
  const key = request.headers.get("CF-Connecting-IP") || "anonymous";
  const { success } = await env.API_RATE_LIMIT.limit({ key });
  return success;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const secret = resolveSecret(env);

    try {
      if (url.pathname.startsWith("/api/") && !(await allowRequest(request, env))) {
        return json({ ok: false, error: "Rate limit exceeded. Slow down." }, 429);
      }

      if (request.method === "GET" && url.pathname === "/api/challenge") {
        return json(createChallengeResponse(secret));
      }

      if (request.method === "POST" && url.pathname === "/api/verify") {
        const result = verifyChallenge(await request.json().catch(() => ({})), secret);
        return json(
          result.ok ? { ok: true, token: result.token } : { ok: false, error: result.error },
          result.status
        );
      }

      if (request.method === "POST" && url.pathname === "/api/verify-token") {
        const body = await request.json().catch(() => ({}));
        const result = verifyToken(body.token, secret);
        return json(result, result.ok ? 200 : 400);
      }

      if (url.pathname.startsWith("/api/")) {
        return json({ ok: false, error: "Not found." }, 404);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ ok: false, error: error.message }, 500);
    }
  }
};
