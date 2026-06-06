import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { deflateSync } from "node:zlib";

const WIDTH = 280;
const HEIGHT = 84;
const TTL_MS = 30_000;
const TOKEN_TTL_MS = 5 * 60_000; // how long a success token stays valid for the host app
const SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SLOT_COUNT = 6;
const GRID = 8; // 8x8 cells per slot => 64 values
const CHECKSUM_SPACE = 64 ** 6;
const POW_BITS = 15;
// Dev fallback only. Production MUST set env.CHALLENGE_SECRET so every isolate
// signs and verifies with the same key (see resolveSecret / worker.js).
const DEV_SECRET = "clanker-captcha-insecure-dev-secret";

// Per-challenge difficulty knobs for the public demo generator.
// The real carriers (fiducials + the true data cell) share one phase across every image
// so a coherent complex sum over the K images reinforces them (K x), while per-image
// phantoms and decoys carry independent random phase and only random-walk up (sqrt(K) x).
const IMAGE_COUNT_CHOICES = [3, 4, 4];
const TRANSFORMS = ["standard", "mirrorCol", "mirrorRow", "swapColRow"];
const LAYOUTS = ["row-major", "col-major", "gray"];
const REAL_AMP = 7; // true data cell amplitude, per image
const FIDUCIAL_FACTOR = 3.2; // fiducials are the strongest coherent carriers
const PHANTOM_FACTOR = 1.3; // per-image phantom still beats the true cell, with less visual snow
const DECOY_AMP = 4;
const DECOY_COUNT = 6;

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function shuffledIndices(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function invertPermutation(permutation) {
  const inverse = [];
  permutation.forEach((symbolIndex, cellValue) => { inverse[symbolIndex] = cellValue; });
  return inverse;
}

// ----- codebook layout: cellValue (0..63) <-> (col,row) in 0..7 ------------------------
function layoutToCell(layout, value) {
  if (layout === "col-major") return { col: Math.floor(value / GRID), row: value % GRID };
  if (layout === "gray") {
    const bi = value ^ (value >> 1);
    return { col: bi % GRID, row: Math.floor(bi / GRID) };
  }
  return { col: value % GRID, row: Math.floor(value / GRID) }; // row-major
}

// ----- transform: data cell (col,row) -> raw grid coords (gx,gy) -----------------------
function applyTransform(transform, col, row) {
  if (transform === "mirrorCol") return { gx: GRID - 1 - col, gy: row };
  if (transform === "mirrorRow") return { gx: col, gy: GRID - 1 - row };
  if (transform === "swapColRow") return { gx: row, gy: col };
  return { gx: col, gy: row }; // standard
}

function gridToBin(params, slot, gx, gy) {
  return {
    kx: params.anchorX[slot] + gx * params.stride,
    ky: params.anchorY + gy * params.step
  };
}

function generateParams() {
  const stride = 2;
  const step = randomInt(3, 5); // 3 or 4
  const pitch = 22;
  const base = 8;
  const anchorX = Array.from({ length: SLOT_COUNT }, (_, i) => base + i * pitch + randomInt(0, 3));
  const anchorY = randomInt(6, 9); // 6..8
  const permutation = shuffledIndices(64); // symbolIndex = permutation[cellValue]

  return {
    imageCount: IMAGE_COUNT_CHOICES[randomInt(0, IMAGE_COUNT_CHOICES.length)],
    transform: TRANSFORMS[randomInt(0, TRANSFORMS.length)],
    layout: LAYOUTS[randomInt(0, LAYOUTS.length)],
    permutation,
    stride,
    step,
    anchorX,
    anchorY,
    checksum: {
      version: randomInt(1, 4), // 1..3
      initial: randomInt(0, 65536),
      multiplier: 97 + 2 * randomInt(0, 59),
      coefA: randomInt(13, 24),
      coefB: randomInt(7, 16)
    }
  };
}

function checksum(params, symbols) {
  const { version, initial, multiplier, coefA, coefB } = params.checksum;
  const values = symbols.map((symbol) => SYMBOLS.indexOf(symbol));
  let acc = initial;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (version === 2) {
      acc = (acc * multiplier + v * v * coefA + i * coefB + v) % CHECKSUM_SPACE;
    } else if (version === 3) {
      acc = ((acc + v + i) * multiplier + v * coefA + coefB) % CHECKSUM_SPACE;
    } else {
      acc = (acc * multiplier + v * (coefA + i * coefB) + (v + i) ** 2) % CHECKSUM_SPACE;
    }
  }
  return encodeBase64Number(acc, 6);
}

function checksumFormula(version) {
  if (version === 2) return "acc = (acc*multiplier + value^2*coefA + i*coefB + value) mod CHECKSUM_SPACE";
  if (version === 3) return "acc = ((acc + value + i)*multiplier + value*coefA + coefB) mod CHECKSUM_SPACE";
  return "acc = (acc*multiplier + value*(coefA + i*coefB) + (value + i)^2) mod CHECKSUM_SPACE";
}

function encodeBase64Number(value, length) {
  let output = "";
  let remaining = value;
  for (let i = 0; i < length; i += 1) {
    output = SYMBOLS[remaining % 64] + output;
    remaining = Math.floor(remaining / 64);
  }
  return output;
}

function randomPhase() {
  return (randomInt(1_000_000) / 1_000_000) * Math.PI * 2;
}

function randomWeights(spread = 0.16) {
  const jitter = () => 1 - spread + (randomInt(0, 1001) / 1000) * spread * 2;
  return [jitter(), jitter(), jitter()];
}

const PALETTES = [
  { base: [12, 14, 30], a: [0, 245, 255], b: [255, 42, 252], c: [250, 255, 48] },
  { base: [18, 10, 32], a: [37, 255, 154], b: [255, 42, 252], c: [0, 245, 255] },
  { base: [8, 18, 34], a: [250, 255, 48], b: [0, 245, 255], c: [255, 42, 252] }
];

// The radial blooms depend only on pixel position (fixed centers), so they are
// identical for every image and every challenge. Compute the two maps once per
// isolate instead of calling Math.hypot W*H times per image.
let BLOOM_CACHE = null;
function getBloomMaps() {
  if (BLOOM_CACHE) return BLOOM_CACHE;
  const a = new Float32Array(WIDTH * HEIGHT);
  const b = new Float32Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    const yNorm = y / (HEIGHT - 1);
    for (let x = 0; x < WIDTH; x += 1) {
      const xNorm = x / (WIDTH - 1);
      const i = y * WIDTH + x;
      a[i] = Math.max(0, 1 - Math.hypot(xNorm - 0.18, yNorm - 0.28) * 2.4);
      b[i] = Math.max(0, 1 - Math.hypot(xNorm - 0.82, yNorm - 0.68) * 2.2);
    }
  }
  BLOOM_CACHE = { a, b };
  return BLOOM_CACHE;
}

// Each image gets its own corrupted video texture so the frames visibly differ
// (the coherent carriers live in the frequency domain and are unaffected).
function drawBackground(pixels) {
  const palette = PALETTES[randomInt(PALETTES.length)];
  const accents = [palette.a, palette.b, palette.c];
  const phaseA = randomPhase();
  const phaseB = randomPhase();
  const noise = randomInt(4, 9);
  const noiseSpan = 2 * noise + 1;
  const scanStep = 3 + randomInt(0, 2);
  const scanDark = randomInt(10, 22);
  const { a: bloomMapA, b: bloomMapB } = getBloomMaps();

  const blendPixel = (x, y, r, g, b, alpha) => {
    if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return;
    const offset = (y * WIDTH + x) * 4;
    pixels[offset] = clamp(pixels[offset] * (1 - alpha) + r * alpha);
    pixels[offset + 1] = clamp(pixels[offset + 1] * (1 - alpha) + g * alpha);
    pixels[offset + 2] = clamp(pixels[offset + 2] * (1 - alpha) + b * alpha);
  };

  const fillRect = (x0, y0, w, h, color, alpha) => {
    const x1 = Math.min(WIDTH, x0 + w);
    const y1 = Math.min(HEIGHT, y0 + h);
    for (let y = Math.max(0, y0); y < y1; y += 1) {
      for (let x = Math.max(0, x0); x < x1; x += 1) {
        blendPixel(x, y, color[0], color[1], color[2], alpha);
      }
    }
  };

  // diagonal = sin(x*0.045 + y*0.12 + phaseA), ripple = cos(x*0.12 - y*0.055 + phaseB).
  // Both separate into per-column and per-row tables via the angle-addition identity,
  // so the inner loop does multiplies instead of a sin + cos per pixel.
  const dSinX = new Float64Array(WIDTH), dCosX = new Float64Array(WIDTH);
  const rSinX = new Float64Array(WIDTH), rCosX = new Float64Array(WIDTH);
  for (let x = 0; x < WIDTH; x += 1) {
    dSinX[x] = Math.sin(x * 0.045); dCosX[x] = Math.cos(x * 0.045);
    rSinX[x] = Math.sin(x * 0.12); rCosX[x] = Math.cos(x * 0.12);
  }
  const dSinY = new Float64Array(HEIGHT), dCosY = new Float64Array(HEIGHT);
  const rSinY = new Float64Array(HEIGHT), rCosY = new Float64Array(HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    dSinY[y] = Math.sin(y * 0.12 + phaseA); dCosY[y] = Math.cos(y * 0.12 + phaseA);
    rSinY[y] = Math.sin(-y * 0.055 + phaseB); rCosY[y] = Math.cos(-y * 0.055 + phaseB);
  }

  const [b0, b1, b2] = palette.base;
  const [pa0, pa1, pa2] = palette.a;
  const [pb0, pb1, pb2] = palette.b;
  const pc1 = palette.c[1];

  for (let y = 0; y < HEIGHT; y += 1) {
    const scan = y % scanStep === 0 ? -scanDark : 0;
    const dcy = dCosY[y], dsy = dSinY[y], rcy = rCosY[y], rsy = rSinY[y];
    const row = y * WIDTH;
    for (let x = 0; x < WIDTH; x += 1) {
      const i = row + x;
      const diagonal = (dSinX[x] * dcy + dCosX[x] * dsy) * 18;
      const ripple = (rCosX[x] * rcy - rSinX[x] * rsy) * 10;
      const bloomA = bloomMapA[i], bloomB = bloomMapB[i];
      const micro = ((Math.random() * noiseSpan) | 0) - noise;
      const o = i * 4;
      pixels[o] = clamp(b0 + pa0 * bloomA * 0.2 + pb0 * bloomB * 0.24 + diagonal + micro + scan);
      pixels[o + 1] = clamp(b1 + pa1 * bloomA * 0.22 + pc1 * bloomB * 0.16 + ripple + micro + scan);
      pixels[o + 2] = clamp(b2 + pa2 * bloomA * 0.26 + pb2 * bloomB * 0.2 - diagonal * 0.35 + micro + scan);
      pixels[o + 3] = 255;
    }
  }

  const bars = 14 + randomInt(0, 10);
  for (let i = 0; i < bars; i += 1) {
    const color = accents[randomInt(3)];
    const x = randomInt(-24, WIDTH - 30);
    const y = randomInt(0, HEIGHT - 4);
    const w = randomInt(26, 118);
    const h = randomInt(2, 9);
    fillRect(x, y, w, h, color, 0.22 + randomInt(0, 22) / 100);
  }

  const shiftRows = 16 + randomInt(0, 12);
  for (let i = 0; i < shiftRows; i += 1) {
    const y = randomInt(HEIGHT);
    const height = randomInt(1, 4);
    const shift = randomInt(-52, 53);
    const tint = accents[randomInt(3)];
    const tintAmount = 0.06 + randomInt(0, 12) / 100;
    for (let row = y; row < Math.min(HEIGHT, y + height); row += 1) {
      const copy = new Uint8ClampedArray(WIDTH * 4);
      for (let x = 0; x < WIDTH; x += 1) {
        const sourceX = (x + shift + WIDTH) % WIDTH;
        const source = (row * WIDTH + sourceX) * 4;
        copy.set(pixels.subarray(source, source + 4), x * 4);
      }
      pixels.set(copy, row * WIDTH * 4);
      for (let x = 0; x < WIDTH; x += 1) {
        blendPixel(x, row, tint[0], tint[1], tint[2], tintAmount);
      }
    }
  }

  const blocks = 10 + randomInt(0, 8);
  for (let i = 0; i < blocks; i += 1) {
    const color = accents[randomInt(3)];
    const w = randomInt(10, 34);
    const h = randomInt(6, 18);
    const x = randomInt(0, WIDTH - w);
    const y = randomInt(0, HEIGHT - h);
    fillRect(x, y, w, h, color, 0.12 + randomInt(0, 14) / 100);
    for (let row = y; row < y + h; row += 3) {
      fillRect(x, row, w, 1, color, 0.22);
    }
  }

  const sparks = 26 + randomInt(0, 28);
  for (let i = 0; i < sparks; i += 1) {
    const color = accents[randomInt(3)];
    const x = randomInt(WIDTH);
    const y = randomInt(HEIGHT);
    const length = randomInt(1, 5);
    for (let j = 0; j < length; j += 1) {
      blendPixel(x + j, y, color[0], color[1], color[2], 0.62);
    }
  }
}

// Carriers shared by every image (same phase => add coherently under a complex sum).
function buildCoherentCarriers(symbols, params, permInv) {
  const carriers = [];

  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    // four corner fiducials, just outside the 0..7 data block, mark the raw grid
    for (const gx of [-1, GRID]) {
      for (const gy of [-1, GRID]) {
        const { kx, ky } = gridToBin(params, slot, gx, gy);
        carriers.push({ kx, ky, phase: randomPhase(), amplitude: REAL_AMP * FIDUCIAL_FACTOR, weights: randomWeights() });
      }
    }
    // the true data cell
    const symbolIndex = SYMBOLS.indexOf(symbols[slot]);
    const cellValue = permInv[symbolIndex];
    const { col, row } = layoutToCell(params.layout, cellValue);
    const { gx, gy } = applyTransform(params.transform, col, row);
    const { kx, ky } = gridToBin(params, slot, gx, gy);
    carriers.push({ kx, ky, phase: randomPhase(), amplitude: REAL_AMP, weights: randomWeights() });
  }
  return carriers;
}

// Per-image carriers with fresh random phase => suppressed by the coherent sum.
function buildIncoherentCarriers(symbols, params, permInv) {
  const carriers = [];

  // one phantom per slot: a wrong cell, stronger than the true cell within a single image
  for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
    const trueCellValue = permInv[SYMBOLS.indexOf(symbols[slot])];
    let phantomValue = randomInt(0, 64);
    while (phantomValue === trueCellValue) phantomValue = randomInt(0, 64);
    const { col, row } = layoutToCell(params.layout, phantomValue);
    const { gx, gy } = applyTransform(params.transform, col, row);
    const { kx, ky } = gridToBin(params, slot, gx, gy);
    carriers.push({ kx, ky, phase: randomPhase(), amplitude: REAL_AMP * PHANTOM_FACTOR, weights: randomWeights(0.6) });
  }

  // off-lattice decoys
  for (let i = 0; i < DECOY_COUNT; i += 1) {
    carriers.push({
      kx: randomInt(7, 137),
      ky: randomInt(4, 41),
      phase: randomPhase(),
      amplitude: randomInt(DECOY_AMP - 4, DECOY_AMP + 5),
      weights: randomWeights(0.9)
    });
  }
  return carriers;
}

function injectCarriers(pixels, carriers) {
  // cos(2π(kx·x/W + ky·y/H) + φ) = cos(Ax + By) = cosAx·cosBy − sinAx·sinBy, where
  // Ax = 2π·kx·x/W and By = 2π·ky·y/H + φ. Precomputing cos/sin over the W columns
  // and H rows once per carrier turns ~W*H cosines per carrier into W+H — the inner
  // loop becomes plain multiply-adds. Output is mathematically identical.
  const N = WIDTH * HEIGHT;
  const accR = new Float64Array(N), accG = new Float64Array(N), accB = new Float64Array(N);
  for (let i = 0; i < N; i += 1) {
    const o = i * 4;
    accR[i] = pixels[o]; accG[i] = pixels[o + 1]; accB[i] = pixels[o + 2];
  }

  const cosX = new Float64Array(WIDTH), sinX = new Float64Array(WIDTH);
  const cosY = new Float64Array(HEIGHT), sinY = new Float64Array(HEIGHT);
  const TAU = Math.PI * 2;

  for (const c of carriers) {
    const fx = TAU * c.kx / WIDTH;
    for (let x = 0; x < WIDTH; x += 1) { const a = fx * x; cosX[x] = Math.cos(a); sinX[x] = Math.sin(a); }
    const fy = TAU * c.ky / HEIGHT;
    for (let y = 0; y < HEIGHT; y += 1) { const b = fy * y + c.phase; cosY[y] = Math.cos(b); sinY[y] = Math.sin(b); }

    const aR = c.amplitude * c.weights[0];
    const aG = c.amplitude * c.weights[1];
    const aB = c.amplitude * c.weights[2];
    for (let y = 0; y < HEIGHT; y += 1) {
      const cby = cosY[y], sby = sinY[y], row = y * WIDTH;
      for (let x = 0; x < WIDTH; x += 1) {
        const wave = cosX[x] * cby - sinX[x] * sby;
        const i = row + x;
        accR[i] += wave * aR; accG[i] += wave * aG; accB[i] += wave * aB;
      }
    }
  }

  for (let i = 0; i < N; i += 1) {
    const o = i * 4;
    pixels[o] = clamp(accR[i]); pixels[o + 1] = clamp(accG[i]); pixels[o + 2] = clamp(accB[i]);
  }
}

function generateChallengeImages(symbols, params) {
  const permInv = invertPermutation(params.permutation);
  const coherent = buildCoherentCarriers(symbols, params, permInv);
  const images = [];
  for (let k = 0; k < params.imageCount; k += 1) {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    drawBackground(pixels);
    injectCarriers(pixels, coherent.concat(buildIncoherentCarriers(symbols, params, permInv)));
    images.push(encodePng(WIDTH, HEIGHT, pixels));
  }
  return images;
}

function makeChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1
    );
  }

  return Buffer.concat([
    signature,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", deflateSync(raw)),
    makeChunk("IEND")
  ]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

// Resolve the signing key. Workers pass `env`, Node passes nothing (we read
// process.env). Falls back to a fixed dev key with a one-time warning so the
// demo runs out of the box, but a real deployment must configure a secret.
let warnedMissingSecret = false;
export function resolveSecret(env) {
  const secret =
    (env && env.CHALLENGE_SECRET) ||
    (typeof process !== "undefined" && process.env && process.env.CHALLENGE_SECRET);
  if (secret) return secret;
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn("CHALLENGE_SECRET is not set; using an insecure dev key. Set it before deploying.");
  }
  return DEV_SECRET;
}

// HMAC binds (expiresAt, salt, answer) together. The id carries expiresAt+salt+sig
// but NOT the answer, so the agent still has to solve for it; verify recomputes the
// HMAC from the submitted answer and accepts only if it matches. No server-side
// state, so it survives Cloudflare's per-isolate memory and isolate eviction.
function signChallenge(secret, expiresAt, salt, answer) {
  return createHmac("sha256", secret)
    .update(`${expiresAt}.${salt}.${answer}`)
    .digest("hex");
}

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length || a.length === 0) {
    return false;
  }
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

// Success token: HMAC-signed so a host app can verify it was issued by this service
// and hasn't expired, without sharing any per-request state. Format: iat.exp.jti.sig
// (all the bytes the signature covers travel in the token; sig proves authenticity).
function issueToken(secret) {
  const issuedAt = Date.now();
  const exp = issuedAt + TOKEN_TTL_MS;
  const jti = randomBytes(8).toString("hex");
  const body = `${issuedAt}.${exp}.${jti}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("hex")}`;
}

// Verify a success token. Returns { ok, issuedAt, exp } or { ok:false, error }.
// The host app calls this (via /api/verify-token or by importing it) to trust a token.
export function verifyToken(token, secret = resolveSecret()) {
  const parts = String(token || "").split(".");
  if (parts.length !== 4) return { ok: false, error: "Malformed token." };
  const [issuedAt, exp, jti, sig] = parts;
  if (!/^\d+$/.test(issuedAt) || !/^\d+$/.test(exp) || !/^[0-9a-f]+$/.test(jti) || !/^[0-9a-f]+$/.test(sig)) {
    return { ok: false, error: "Malformed token." };
  }
  const expected = createHmac("sha256", secret).update(`${issuedAt}.${exp}.${jti}`).digest("hex");
  if (!safeEqualHex(sig, expected)) return { ok: false, error: "Bad signature." };
  if (Date.now() > Number(exp)) return { ok: false, error: "Token expired." };
  return { ok: true, issuedAt: Number(issuedAt), exp: Number(exp) };
}

function createChallenge(secret) {
  const params = generateParams();
  const symbols = shuffledIndices(SYMBOLS.length).slice(0, SLOT_COUNT).map((index) => SYMBOLS[index]);

  const answer = checksum(params, symbols);
  const expiresAt = Date.now() + TTL_MS;
  const salt = randomBytes(16).toString("hex");
  const id = `${expiresAt}.${salt}.${signChallenge(secret, expiresAt, salt, answer)}`;
  const images = generateChallengeImages(symbols, params);

  return {
    id,
    width: WIDTH,
    height: HEIGHT,
    imageCount: params.imageCount,
    expiresAt,
    images: images.map((png) => `data:image/png;base64,${png.toString("base64")}`),
    publicHint:
      "Multi-image fused CAPTCHA. The lattice geometry is NOT disclosed — recover it from the fiducials. A single image is insufficient.",
    agentTask:
      "Coherently fuse all images (sum the complex DFT across them), recover each slot's lattice from its 4 corner fiducials, read the strongest interior cell, map it through the disclosed layout + permutation, compute the checksum, find the PoW nonce, then submit.",
    agentManifest: {
      solve: {
        fusion:
          "Compute the complex DFT of EACH image and SUM the complex spectra across all images (coherent integration), then take magnitude. Real carriers share phase across images and reinforce (x imageCount); per-image phantoms/decoys have random phase and only random-walk up (x sqrt(imageCount)). A single image points at the wrong cell.",
        imageCount: params.imageCount,
        transform: params.transform,
        transformNote:
          "Maps a data cell (col,row in 0..7) to raw grid coords (gx,gy): standard=(col,row); mirrorCol=(7-col,row); mirrorRow=(col,7-row); swapColRow=(row,col).",
        lattice: {
          slots: SLOT_COUNT,
          grid: `${GRID}x${GRID} cells per slot, col and row in 0..${GRID - 1}`,
          binFormula: "kx = anchorX[slot] + gx*stride; ky = anchorY + gy*step",
          fiducials:
            "Each slot has 4 coherent fiducial carriers at raw grid corners (gx,gy) in {-1, 8} x {-1, 8}, OUTSIDE the data cells and stronger than any data cell after fusion. Use them to recover anchorX[slot], anchorY, stride, step per slot.",
          hidden: ["anchorX[slot]", "anchorY", "stride", "step"],
          note: "Geometry is intentionally NOT provided. Infer it from the fiducial peaks in the fused spectrum."
        },
        codebook: {
          layout: params.layout,
          layoutNote:
            "cellValue<->(col,row): row-major col=v%8,row=floor(v/8); col-major row=v%8,col=floor(v/8); gray bi=v^(v>>1),col=bi%8,row=floor(bi/8).",
          permutation: params.permutation,
          permutationNote: "symbolIndex = permutation[cellValue]; symbol = alphabet[symbolIndex].",
          alphabet: SYMBOLS,
          valueRange: [0, 63],
          selection:
            "For each slot, the data cell is the strongest INTERIOR on-lattice point (col,row in 0..7) in the fused magnitude spectrum."
        },
        checksum: {
          version: params.checksum.version,
          initial: params.checksum.initial,
          multiplier: params.checksum.multiplier,
          coefA: params.checksum.coefA,
          coefB: params.checksum.coefB,
          mod: CHECKSUM_SPACE,
          formula: checksumFormula(params.checksum.version),
          outputAlphabet: SYMBOLS,
          outputLength: 6,
          padding: "left-pad with A"
        },
        pow: {
          algorithm: "SHA-256",
          inputTemplate: `${id}:<nonce>`,
          difficultyBits: POW_BITS,
          requirement: `Find an integer nonce such that SHA-256 of the UTF-8 string "${id}:<nonce>" has at least ${POW_BITS} leading zero bits. Submit nonce as a decimal string in the verify body's "nonce" field.`,
          submitField: "nonce"
        }
      }
    }
  };
}

function checkPow(challengeId, nonce, bits) {
  if (nonce == null) return false;
  const nonceStr = String(nonce);
  if (!/^\d+$/.test(nonceStr)) return false;
  const hash = createHash("sha256").update(`${challengeId}:${nonceStr}`).digest();
  const fullBytes = Math.floor(bits / 8);
  const remBits = bits % 8;
  return hash.subarray(0, fullBytes).every((byte) => byte === 0) &&
    (remBits === 0 || hash[fullBytes] >>> (8 - remBits) === 0);
}

export async function readNodeJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function verifyChallenge(body, secret) {
  const id = String(body.challengeId || "");
  const parts = id.split(".");
  if (parts.length !== 3) return { ok: false, status: 400, error: "Unknown challenge." };
  const [expiresAtStr, salt, sig] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt) || !/^[0-9a-f]+$/.test(salt) || !/^[0-9a-f]+$/.test(sig)) {
    return { ok: false, status: 400, error: "Unknown challenge." };
  }

  if (Date.now() > expiresAt) {
    return { ok: false, status: 410, error: "Challenge expired." };
  }

  if (!checkPow(id, body.nonce, POW_BITS)) {
    return { ok: false, status: 400, error: "Proof-of-work invalid." };
  }

  // Tampering with expiresAt or salt also lands here: the signature only matches
  // when (expiresAt, salt, answer) reproduce the value minted by createChallenge.
  // Replay within the TTL is possible (no server state to burn the id); the short
  // TTL + per-id PoW keep that expensive — add a Durable Object if you need single-use.
  const answer = String(body.answer || "").trim();
  if (!safeEqualHex(sig, signChallenge(secret, expiresAtStr, salt, answer))) {
    return { ok: false, status: 400, error: "Fourier checksum mismatch." };
  }

  return { ok: true, status: 200, token: issueToken(secret) };
}

export function writeJson(response, status, body) {
  json(response, status, body);
}

export function handleChallengeRequest(request, response, secret = resolveSecret()) {
  try {
    if (request.method === "GET" && request.url?.startsWith("/api/challenge")) {
      json(response, 200, createChallenge(secret));
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/verify-token")) {
      readNodeJson(request)
        .then((body) => {
          const result = verifyToken(body.token, secret);
          json(response, result.ok ? 200 : 400, result);
        })
        .catch((error) => json(response, 400, { ok: false, error: error.message }));
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/verify")) {
      readNodeJson(request)
        .then((body) => {
          const result = verifyChallenge(body, secret);
          json(response, result.status, result.ok ? { ok: true, token: result.token } : { ok: false, error: result.error });
        })
        .catch((error) => json(response, 400, { ok: false, error: error.message }));
      return;
    }

    return false;
  } catch (error) {
    json(response, 500, { ok: false, error: error.message });
  }
  return true;
}

export function createChallengeResponse(secret = resolveSecret()) {
  return createChallenge(secret);
}
