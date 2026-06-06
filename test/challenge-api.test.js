import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  createChallengeResponse,
  verifyChallenge,
  verifyToken
} from "../src/challenge-api.js";

const SECRET = "test-secret-key";
const POW_BITS = 15;

// Recreate the server's challenge-id signature so a test can mint a challenge with
// a known answer (the real answer is derived from solving the image, not exposed).
function signChallenge(secret, expiresAt, salt, answer) {
  return createHmac("sha256", secret).update(`${expiresAt}.${salt}.${answer}`).digest("hex");
}

function makeChallengeId(secret, answer, { ttlMs = 30000, salt = "a".repeat(32) } = {}) {
  const expiresAt = Date.now() + ttlMs;
  return `${expiresAt}.${salt}.${signChallenge(secret, expiresAt, salt, answer)}`;
}

// Mine a 15-bit PoW nonce for the given challenge id (fast: ~2^15 hashes).
function minePow(id, bits = POW_BITS) {
  const fullBytes = Math.floor(bits / 8);
  const remBits = bits % 8;
  for (let nonce = 0; ; nonce += 1) {
    const h = createHash("sha256").update(`${id}:${nonce}`).digest();
    let ok = true;
    for (let i = 0; i < fullBytes; i += 1) if (h[i] !== 0) { ok = false; break; }
    if (ok && (remBits === 0 || h[fullBytes] >>> (8 - remBits) === 0)) return String(nonce);
  }
}

test("createChallengeResponse returns a well-formed, stateless challenge", () => {
  const ch = createChallengeResponse(SECRET);
  assert.match(ch.id, /^\d+\.[0-9a-f]{32}\.[0-9a-f]{64}$/);
  assert.ok(Array.isArray(ch.images) && ch.images.length >= 3);
  assert.ok(ch.images.every((d) => d.startsWith("data:image/png;base64,")));
  assert.equal("answer" in ch, false, "must not leak the answer");
  assert.ok(ch.agentManifest.solve.pow.difficultyBits === POW_BITS);
});

test("verifyChallenge accepts a correct answer + PoW and issues a verifiable token", () => {
  const answer = "AbZ9+/";
  const id = makeChallengeId(SECRET, answer);
  const res = verifyChallenge({ challengeId: id, answer, nonce: minePow(id) }, SECRET);
  assert.equal(res.ok, true);
  assert.equal(res.status, 200);
  assert.equal(verifyToken(res.token, SECRET).ok, true);
});

test("verifyChallenge rejects wrong answer, wrong secret, bad PoW, expiry, tamper, malformed", () => {
  const answer = "GOODxx";
  const id = makeChallengeId(SECRET, answer);
  const nonce = minePow(id);

  assert.equal(verifyChallenge({ challengeId: id, answer: "WRONGx", nonce }, SECRET).status, 400);
  assert.equal(verifyChallenge({ challengeId: id, answer, nonce }, "other-secret").status, 400);
  assert.equal(verifyChallenge({ challengeId: id, answer, nonce: "0" }, SECRET).status, 400);
  assert.equal(verifyChallenge({ challengeId: "not.a.valid", answer, nonce }, SECRET).status, 400);

  const expired = makeChallengeId(SECRET, answer, { ttlMs: -1000 });
  assert.equal(verifyChallenge({ challengeId: expired, answer, nonce: minePow(expired) }, SECRET).status, 410);

  // Tamper the expiry in the id: signature no longer matches.
  const [exp, salt, sig] = id.split(".");
  const tampered = `${Number(exp) + 60000}.${salt}.${sig}`;
  assert.equal(verifyChallenge({ challengeId: tampered, answer, nonce: minePow(tampered) }, SECRET).ok, false);
});

test("verifyChallenge is replayable within the TTL (documented trade-off)", () => {
  const answer = "REPLAY";
  const id = makeChallengeId(SECRET, answer);
  const nonce = minePow(id);
  assert.equal(verifyChallenge({ challengeId: id, answer, nonce }, SECRET).ok, true);
  assert.equal(verifyChallenge({ challengeId: id, answer, nonce }, SECRET).ok, true);
});

test("verifyToken rejects tampered, expired, and malformed tokens", () => {
  const answer = "TOKENx";
  const id = makeChallengeId(SECRET, answer);
  const { token } = verifyChallenge({ challengeId: id, answer, nonce: minePow(id) }, SECRET);

  assert.equal(verifyToken(token, "wrong-secret").ok, false);
  assert.equal(verifyToken(token + "ff", SECRET).ok, false);
  assert.equal(verifyToken("garbage", SECRET).ok, false);

  // Hand-build an expired but correctly-signed token.
  const iat = Date.now() - 10 * 60_000;
  const exp = iat + 1000;
  const jti = "deadbeefdeadbeef";
  const sig = createHmac("sha256", SECRET).update(`${iat}.${exp}.${jti}`).digest("hex");
  assert.equal(verifyToken(`${iat}.${exp}.${jti}.${sig}`, SECRET).error, "Token expired.");
});
