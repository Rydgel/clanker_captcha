import { createChallengeResponse, verifyChallenge } from "./challenge-api.js";

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/api/challenge") {
        return json(createChallengeResponse());
      }

      if (request.method === "POST" && url.pathname === "/api/verify") {
        const result = verifyChallenge(await request.json().catch(() => ({})));
        return json(
          result.ok ? { ok: true, token: result.token } : { ok: false, error: result.error },
          result.status
        );
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
