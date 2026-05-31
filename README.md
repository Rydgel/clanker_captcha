# Clanker CAPTCHA

Clanker CAPTCHA is an experimental CAPTCHA widget built for a world where the solver is an agent reading pixels, not a human typing distorted text.

Made by [Jérôme Mahuet](https://jeromem.dev).

The challenge is intentionally hostile to quick human inspection. Each CAPTCHA ships several noisy image frames. A solver has to compute the complex 2D DFT of every frame, coherently fuse the spectra, recover a hidden lattice from fiducial peaks, decode a symbol sequence, compute a checksum, and include a short proof-of-work nonce when submitting.

This repository contains:

- A browser widget library: [src/clanker-captcha.js](./src/clanker-captcha.js)
- A local demo and reference challenge server: [server.js](./server.js)
- A cyberpunk demo page: [index.html](./index.html)

## Status

This is a research/prototype CAPTCHA, not a production abuse-prevention system.

Use it to explore agent-readable challenges, metadata contracts, and server/browser integration patterns. Do not assume it provides real-world bot resistance without review, threat modeling, rate limiting, replay protection, observability, and deployment hardening.

## Demo

```sh
npm install
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## Browser Usage

The page using the library only needs a mount point and endpoint URLs:

```html
<div id="clanker"></div>

<script type="module">
  import { ClankerCaptcha } from "./src/clanker-captcha.js";

  ClankerCaptcha.mount("#clanker", {
    challengeUrl: "/api/challenge",
    verifyUrl: "/api/verify",
    onSolved(token) {
      console.log("Clanker token:", token);
    }
  });
</script>
```

The library owns its DOM, styles, hidden agent instructions, and metadata injection. Consumers should not hand-author the `clanker-agent-task` meta tag or the JSON manifest.

## What The Widget Injects

When mounted, `ClankerCaptcha` creates:

- The visible CAPTCHA UI.
- A hidden text instruction node for assistive/agent discovery.
- A `<meta name="clanker-agent-task">` tag in `document.head`.
- Current challenge attributes on the widget root: `data-clanker-challenge-id`, `data-clanker-expires-at`, and `data-clanker-image-count`.
- A `<script type="application/clanker+json">` manifest containing frame selectors, image data, solve parameters, submission instructions, and constraints.

The meta tag and manifest are populated with loading/default metadata immediately, then updated after the challenge response arrives. Every new challenge fetch receives a fresh `challengeId`, `expiresAt`, frame set, manifest body, and root data attributes.

## API

### `ClankerCaptcha.mount(target, options)`

Mounts a widget and returns the instance.

`target` can be a selector string or an element.

Options:

| Option | Default | Description |
| --- | --- | --- |
| `challengeUrl` | `/api/challenge` | Endpoint that returns a new challenge. |
| `verifyUrl` | `/api/verify` | Endpoint that verifies an answer and nonce. |
| `onSolved(token)` | no-op | Callback fired after a successful verification. |

## Challenge Endpoint Contract

`GET /api/challenge` returns JSON:

```json
{
  "id": "challenge-id",
  "width": 280,
  "height": 84,
  "imageCount": 4,
  "expiresAt": 1760000000000,
  "images": ["data:image/png;base64,..."],
  "publicHint": "Multi-image fused CAPTCHA...",
  "agentTask": "Coherently fuse all images...",
  "agentManifest": {
    "solve": {
      "fusion": "...",
      "imageCount": 4,
      "transform": "standard",
      "lattice": {},
      "codebook": {},
      "checksum": {},
      "pow": {}
    }
  }
}
```

Important details:

- The answer is not sent to the browser.
- The browser receives public solve instructions and image data.
- The lattice anchors and step geometry are intentionally not disclosed.
- The manifest discloses the transform, layout, permutation, checksum parameters, and proof-of-work requirement.

## Verify Endpoint Contract

`POST /api/verify` receives:

```json
{
  "challengeId": "challenge-id",
  "answer": "ABC123",
  "nonce": "12345"
}
```

On success:

```json
{
  "ok": true,
  "token": "server-issued-token"
}
```

On failure:

```json
{
  "ok": false,
  "error": "Fourier checksum mismatch."
}
```

## How The Demo Challenge Works

For each challenge, the server:

1. Chooses six symbols from a 64-character alphabet.
2. Maps each symbol through a randomized codebook, layout, transform, and hidden lattice.
3. Renders several PNG frames with corrupted neon video texture.
4. Injects coherent Fourier carriers for the real fiducials and data cells.
5. Injects per-frame phantom carriers and decoys with random phase.
6. Signs the expiry and expected checksum into the challenge id (HMAC), keeping no server-side state.

A compliant agent is expected to solve from rendered frames and the public
manifest for that live challenge. This public repository intentionally does not
ship a runnable reference solver: publishing one would encourage agents to read
the implementation instead of performing the intended pixel-grounded work.

## Server Notes

The included server is deliberately dependency-free and suitable for local demos. It is not an application framework.

Challenge state is stateless and signed: `createChallenge` packs the expiry and a
random salt into the challenge id and HMACs them together with the expected checksum.
`verifyChallenge` recomputes the HMAC from the submitted answer, so no per-challenge
record is stored anywhere. This is what lets it run unchanged on Cloudflare Workers,
where each request may hit a different (and frequently recycled) isolate — an
in-memory store would lose challenges between `/api/challenge` and `/api/verify`.

Set `CHALLENGE_SECRET` so every instance/isolate signs with the same key:

```sh
# Cloudflare
wrangler secret put CHALLENGE_SECRET
# Local / Node demo
CHALLENGE_SECRET=your-long-random-string npm run demo
```

Without it, the server falls back to an insecure built-in dev key and logs a warning.

Production integrations should replace it with application-specific endpoints that add:

- Replay protection and one-time token handling (the signed id is currently replayable within its short TTL; a Durable Object can burn it single-use).
- Rate limiting and abuse telemetry.
- CSRF/CORS policy appropriate to the host app.
- Stronger token issuance and session binding.
- Deployment-specific cache and TLS behavior.

## Development

Check syntax:

```sh
npm run check
```

Manual smoke test: start the demo, open the page, solve the displayed challenge,
and confirm the verification state changes.

## Repository Layout

```text
.
├── index.html              # Demo page
├── package.json            # ESM package metadata and scripts
├── server.js               # Local static + challenge/verify server (Node)
├── wrangler.jsonc          # Cloudflare Workers deployment config
└── src/
    ├── challenge-api.js    # Shared challenge generation + stateless verify
    ├── worker.js           # Cloudflare Worker entrypoint
    └── clanker-captcha.js  # Browser widget library
```

## License

MIT

Created by [Jérôme Mahuet](https://jeromem.dev).
