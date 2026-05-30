import { createHash, randomBytes, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { deflateSync } from "node:zlib";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const ROOT = process.cwd();
const WIDTH = 280;
const HEIGHT = 84;
const TTL_MS = 30_000;
const SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SLOT_COUNT = 6;
const GRID = 8; // 8x8 cells per slot => 64 values
const CHECKSUM_SPACE = 64 ** 6;
const POW_BITS = 15;
const CHALLENGES = new Map();

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

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

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
  const anchorX = [];
  for (let i = 0; i < SLOT_COUNT; i += 1) {
    anchorX.push(base + i * pitch + randomInt(0, 3));
  }
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

function setPixel(pixels, x, y, r, g, b, a = 255) {
  const offset = (y * WIDTH + x) * 4;
  pixels[offset] = clamp(r);
  pixels[offset + 1] = clamp(g);
  pixels[offset + 2] = clamp(b);
  pixels[offset + 3] = a;
}

function randomPhase() {
  return (randomInt(1_000_000) / 1_000_000) * Math.PI * 2;
}

function randomWeights(spread = 0.16) {
  const jitter = () => 1 - spread + (randomInt(0, 1001) / 1000) * spread * 2;
  return [jitter(), jitter(), jitter()];
}

// Each image gets its own corrupted video texture so the frames visibly differ
// (the coherent carriers live in the frequency domain and are unaffected).
function drawBackground(pixels) {
  const palettes = [
    { base: [12, 14, 30], a: [0, 245, 255], b: [255, 42, 252], c: [250, 255, 48] },
    { base: [18, 10, 32], a: [37, 255, 154], b: [255, 42, 252], c: [0, 245, 255] },
    { base: [8, 18, 34], a: [250, 255, 48], b: [0, 245, 255], c: [255, 42, 252] }
  ];
  const palette = palettes[randomInt(palettes.length)];
  const phaseA = randomPhase();
  const phaseB = randomPhase();
  const noise = randomInt(4, 9);
  const scanStep = 3 + randomInt(0, 2);
  const scanDark = randomInt(10, 22);

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

  for (let y = 0; y < HEIGHT; y += 1) {
    const yNorm = y / (HEIGHT - 1);
    const scan = y % scanStep === 0 ? -scanDark : 0;
    for (let x = 0; x < WIDTH; x += 1) {
      const xNorm = x / (WIDTH - 1);
      const diagonal = Math.sin(x * 0.045 + y * 0.12 + phaseA) * 18;
      const ripple = Math.cos(x * 0.12 - y * 0.055 + phaseB) * 10;
      const bloomA = Math.max(0, 1 - Math.hypot(xNorm - 0.18, yNorm - 0.28) * 2.4);
      const bloomB = Math.max(0, 1 - Math.hypot(xNorm - 0.82, yNorm - 0.68) * 2.2);
      const micro = randomInt(-noise, noise + 1);
      const r = palette.base[0] + palette.a[0] * bloomA * 0.2 + palette.b[0] * bloomB * 0.24 + diagonal + micro + scan;
      const g = palette.base[1] + palette.a[1] * bloomA * 0.22 + palette.c[1] * bloomB * 0.16 + ripple + micro + scan;
      const b = palette.base[2] + palette.a[2] * bloomA * 0.26 + palette.b[2] * bloomB * 0.2 - diagonal * 0.35 + micro + scan;
      setPixel(pixels, x, y, r, g, b);
    }
  }

  const bars = 14 + randomInt(0, 10);
  for (let i = 0; i < bars; i += 1) {
    const color = [palette.a, palette.b, palette.c][randomInt(3)];
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
    const tint = [palette.a, palette.b, palette.c][randomInt(3)];
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
    const color = [palette.a, palette.b, palette.c][randomInt(3)];
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
    const color = [palette.a, palette.b, palette.c][randomInt(3)];
    const x = randomInt(WIDTH);
    const y = randomInt(HEIGHT);
    const length = randomInt(1, 5);
    for (let j = 0; j < length; j += 1) {
      blendPixel(x + j, y, color[0], color[1], color[2], 0.62);
    }
  }
}

// Carriers shared by every image (same phase => add coherently under a complex sum).
function buildCoherentCarriers(symbols, params) {
  const carriers = [];
  const permInv = new Array(64);
  params.permutation.forEach((symbolIndex, cellValue) => {
    permInv[symbolIndex] = cellValue;
  });

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
function buildIncoherentCarriers(symbols, params) {
  const carriers = [];
  const permInv = new Array(64);
  params.permutation.forEach((symbolIndex, cellValue) => {
    permInv[symbolIndex] = cellValue;
  });

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
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      let r = pixels[offset];
      let g = pixels[offset + 1];
      let b = pixels[offset + 2];
      for (const c of carriers) {
        const wave = Math.cos(Math.PI * 2 * (c.kx * x / WIDTH + c.ky * y / HEIGHT) + c.phase);
        r += wave * c.amplitude * c.weights[0];
        g += wave * c.amplitude * c.weights[1];
        b += wave * c.amplitude * c.weights[2];
      }
      setPixel(pixels, x, y, r, g, b);
    }
  }
}

function generateChallengeImages(symbols, params) {
  const coherent = buildCoherentCarriers(symbols, params);
  const images = [];
  for (let k = 0; k < params.imageCount; k += 1) {
    const pixels = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
    drawBackground(pixels);
    injectCarriers(pixels, coherent.concat(buildIncoherentCarriers(symbols, params)));
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

function createChallenge() {
  const params = generateParams();
  const used = new Set();
  const symbols = [];
  while (symbols.length < SLOT_COUNT) {
    const symbol = SYMBOLS[randomInt(SYMBOLS.length)];
    if (!used.has(symbol)) {
      used.add(symbol);
      symbols.push(symbol);
    }
  }

  const answer = checksum(params, symbols);
  const id = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + TTL_MS;
  const images = generateChallengeImages(symbols, params);

  CHALLENGES.set(id, { answer, expiresAt });

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
  for (let i = 0; i < fullBytes; i += 1) if (hash[i] !== 0) return false;
  const remBits = bits % 8;
  if (remBits === 0) return true;
  return hash[fullBytes] >>> (8 - remBits) === 0;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function verifyChallenge(body) {
  const challenge = CHALLENGES.get(body.challengeId);
  if (!challenge) return { ok: false, status: 400, error: "Unknown challenge." };
  CHALLENGES.delete(body.challengeId);

  if (Date.now() > challenge.expiresAt) {
    return { ok: false, status: 410, error: "Challenge expired." };
  }

  if (!checkPow(body.challengeId, body.nonce, POW_BITS)) {
    return { ok: false, status: 400, error: "Proof-of-work invalid." };
  }

  if (String(body.answer || "").trim() !== challenge.answer) {
    return { ok: false, status: 400, error: "Fourier checksum mismatch." };
  }

  const token = createHash("sha256")
    .update(`${body.challengeId}:${challenge.answer}:${Date.now()}`)
    .digest("hex");
  return { ok: true, status: 200, token };
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const rawPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = normalize(join(ROOT, rawPath));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function cleanupExpiredChallenges() {
  const now = Date.now();
  for (const [id, challenge] of CHALLENGES) {
    if (challenge.expiresAt < now) CHALLENGES.delete(id);
  }
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url?.startsWith("/api/challenge")) {
      cleanupExpiredChallenges();
      json(response, 200, createChallenge());
      return;
    }

    if (request.method === "POST" && request.url?.startsWith("/api/verify")) {
      const result = verifyChallenge(await readJson(request));
      json(response, result.status, result.ok ? { ok: true, token: result.token } : { ok: false, error: result.error });
      return;
    }

    if (request.method === "GET") {
      await serveStatic(request, response);
      return;
    }

    response.writeHead(405);
    response.end("Method not allowed");
  } catch (error) {
    json(response, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Clanker CAPTCHA demo running at http://${HOST}:${PORT}`);
});
