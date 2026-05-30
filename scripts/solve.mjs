import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

// Reference solver and regression harness for Clanker CAPTCHA.
//
// This file is deliberately NOT part of the browser widget runtime. It is here
// to document the intended agent solve path, prove that the public challenge
// contract is sufficient, and give maintainers a quick smoke test after changing
// the renderer, manifest, checksum, or verification logic.
//
// A real verifier still keeps the answer server-side. This script behaves like a
// cooperative pixel-reading agent: it fetches a challenge, reads the PNG frames,
// follows the manifest instructions, computes the answer and proof-of-work nonce,
// then submits them to /api/verify.
//
//   node scripts/solve.mjs              solve once (coherent fusion across all images)
//   node scripts/solve.mjs --runs 20    solve N challenges, report the success rate
//   node scripts/solve.mjs --naive      decode from a SINGLE image only (should fail:
//                                        per-image phantoms outshine the true cell, so
//                                        only a coherent sum across images recovers it)
//
// The lattice geometry (anchorX[slot], anchorY, stride, step) is NOT in the manifest; it
// is recovered from each slot's 4 corner fiducials by maximizing fiducial energy in the
// fused spectrum. Transform / layout / permutation / checksum ARE disclosed and applied.

const TARGET = process.env.CLANKER_URL || "http://127.0.0.1:4173";
const SYMBOLS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const GRID = 8;
const KXMAX = 139;
const KYMAX = 41;
const KYN = KYMAX + 1;

const args = process.argv.slice(2);
const NAIVE = args.includes("--naive");
const runsIdx = args.indexOf("--runs");
const RUNS = runsIdx >= 0 ? Number(args[runsIdx + 1]) : 1;

function parsePngDataUrl(dataUrl, width, height) {
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  let offset = 8;
  const idat = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.subarray(offset + 4, offset + 8).toString("ascii");
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}`);
    raw.copy(pixels, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  }
  return pixels;
}

function centeredLuma(pixels, width, height) {
  const luma = new Float64Array(width * height);
  let mean = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const o = (y * width + x) * 4;
      const v = pixels[o] * 0.299 + pixels[o + 1] * 0.587 + pixels[o + 2] * 0.114;
      luma[y * width + x] = v;
      mean += v;
    }
  }
  mean /= luma.length;
  for (let i = 0; i < luma.length; i += 1) luma[i] -= mean;
  return luma;
}

// Trig tables for a separable 2D DFT over kx in 0..KXMAX, ky in 0..KYMAX.
function trigTables(width, height) {
  const cosX = [], sinX = [];
  for (let kx = 0; kx <= KXMAX; kx += 1) {
    const cr = new Float64Array(width), sr = new Float64Array(width);
    for (let x = 0; x < width; x += 1) {
      const a = (-2 * Math.PI * kx * x) / width;
      cr[x] = Math.cos(a);
      sr[x] = Math.sin(a);
    }
    cosX.push(cr); sinX.push(sr);
  }
  const cosY = [], sinY = [];
  for (let ky = 0; ky <= KYMAX; ky += 1) {
    const cr = new Float64Array(height), sr = new Float64Array(height);
    for (let y = 0; y < height; y += 1) {
      const a = (-2 * Math.PI * ky * y) / height;
      cr[y] = Math.cos(a);
      sr[y] = Math.sin(a);
    }
    cosY.push(cr); sinY.push(sr);
  }
  return { cosX, sinX, cosY, sinY };
}

// Complex spectrum F[kx*KYN + ky] for one image, via row DFT then column DFT.
function spectrum(luma, width, height, tt) {
  // inner: per row y, per kx -> rowRe[y][kx], rowIm[y][kx]
  const rowRe = [], rowIm = [];
  for (let y = 0; y < height; y += 1) {
    const re = new Float64Array(KXMAX + 1), im = new Float64Array(KXMAX + 1);
    const base = y * width;
    for (let kx = 0; kx <= KXMAX; kx += 1) {
      const cr = tt.cosX[kx], sr = tt.sinX[kx];
      let sre = 0, sim = 0;
      for (let x = 0; x < width; x += 1) {
        const v = luma[base + x];
        sre += v * cr[x];
        sim += v * sr[x];
      }
      re[kx] = sre; im[kx] = sim;
    }
    rowRe.push(re); rowIm.push(im);
  }
  // outer: per kx, per ky -> F[kx][ky]
  const re = new Float64Array((KXMAX + 1) * KYN);
  const im = new Float64Array((KXMAX + 1) * KYN);
  for (let kx = 0; kx <= KXMAX; kx += 1) {
    for (let ky = 0; ky <= KYMAX; ky += 1) {
      const cy = tt.cosY[ky], sy = tt.sinY[ky];
      let sre = 0, sim = 0;
      for (let y = 0; y < height; y += 1) {
        const a = rowRe[y][kx], b = rowIm[y][kx];
        const c = cy[y], d = sy[y];
        sre += a * c - b * d;
        sim += a * d + b * c;
      }
      re[kx * KYN + ky] = sre;
      im[kx * KYN + ky] = sim;
    }
  }
  return { re, im };
}

function magAt(mag, kx, ky) {
  if (kx < 0 || kx > KXMAX || ky < 0 || ky > KYMAX) return 0;
  return mag[kx * KYN + ky];
}

// Recover the hidden geometry from the 4 fiducial corners (gx,gy in {-1, GRID}).
// stride/step/anchorY are global; the 6 slot anchors are the 6 strongest, well-separated
// corner-energy peaks. Fiducial energy is a sharp single-bin spike at each true anchor.
function recoverGeometry(mag, slots) {
  let best = null;
  for (const stride of [2, 3]) {
    for (const step of [3, 4, 5]) {
      for (let anchorY = 4; anchorY <= 12; anchorY += 1) {
        const top = anchorY - step;
        const bottom = anchorY + GRID * step;
        if (top < 0 || bottom > KYMAX) continue;

        const cand = [];
        for (let a = 4; a + GRID * stride <= KXMAX; a += 1) {
          const left = a - stride;
          const right = a + GRID * stride;
          if (left < 0) continue;
          const e =
            magAt(mag, left, top) + magAt(mag, left, bottom) +
            magAt(mag, right, top) + magAt(mag, right, bottom);
          cand.push({ a, e });
        }
        cand.sort((p, q) => q.e - p.e);

        const chosen = [];
        let total = 0;
        for (const { a, e } of cand) {
          if (chosen.length >= slots) break;
          if (chosen.every((c) => Math.abs(c - a) > 11)) { // separation < pitch (22)
            chosen.push(a);
            total += e;
          }
        }
        if (chosen.length < slots) continue;
        if (!best || total > best.total) {
          best = { total, stride, step, anchorY, anchorX: chosen.slice().sort((p, q) => p - q) };
        }
      }
    }
  }
  return best;
}

function layoutToCell(layout, value) {
  if (layout === "col-major") return { col: Math.floor(value / GRID), row: value % GRID };
  if (layout === "gray") {
    const bi = value ^ (value >> 1);
    return { col: bi % GRID, row: Math.floor(bi / GRID) };
  }
  return { col: value % GRID, row: Math.floor(value / GRID) };
}

function applyTransform(transform, col, row) {
  if (transform === "mirrorCol") return { gx: GRID - 1 - col, gy: row };
  if (transform === "mirrorRow") return { gx: col, gy: GRID - 1 - row };
  if (transform === "swapColRow") return { gx: row, gy: col };
  return { gx: col, gy: row };
}

function decodeSlot(mag, solve, geom, slot) {
  let best = null;
  for (let value = 0; value < 64; value += 1) {
    const { col, row } = layoutToCell(solve.codebook.layout, value);
    const { gx, gy } = applyTransform(solve.transform, col, row);
    const kx = geom.anchorX[slot] + gx * geom.stride;
    const ky = geom.anchorY + gy * geom.step;
    const m = magAt(mag, kx, ky);
    if (!best || m > best.m) best = { value, m, kx, ky };
  }
  const symbolIndex = solve.codebook.permutation[best.value];
  return { slot, symbol: SYMBOLS[symbolIndex], cellValue: best.value, magnitude: Math.round(best.m) };
}

function computeChecksum(solve, symbols) {
  const { version, initial, multiplier, coefA, coefB, mod } = solve.checksum;
  const values = symbols.map((s) => SYMBOLS.indexOf(s));
  let acc = initial;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (version === 2) acc = (acc * multiplier + v * v * coefA + i * coefB + v) % mod;
    else if (version === 3) acc = ((acc + v + i) * multiplier + v * coefA + coefB) % mod;
    else acc = (acc * multiplier + v * (coefA + i * coefB) + (v + i) ** 2) % mod;
  }
  let output = "", remaining = acc;
  for (let i = 0; i < solve.checksum.outputLength; i += 1) {
    output = SYMBOLS[remaining % 64] + output;
    remaining = Math.floor(remaining / 64);
  }
  return output;
}

function findPow(challengeId, bits) {
  const fullBytes = Math.floor(bits / 8);
  const remBits = bits % 8;
  let nonce = 0;
  while (true) {
    const hash = createHash("sha256").update(`${challengeId}:${nonce}`).digest();
    let ok = true;
    for (let i = 0; i < fullBytes; i += 1) if (hash[i] !== 0) { ok = false; break; }
    if (ok && remBits > 0 && hash[fullBytes] >>> (8 - remBits) !== 0) ok = false;
    if (ok) return String(nonce);
    nonce += 1;
  }
}

async function solveOnce(verbose) {
  const challenge = await (await fetch(`${TARGET}/api/challenge`)).json();
  const solve = challenge.agentManifest.solve;
  const { width, height } = challenge;
  const tt = trigTables(width, height);

  // coherent fusion: sum the COMPLEX spectra across all images, then take magnitude.
  const fusedRe = new Float64Array((KXMAX + 1) * KYN);
  const fusedIm = new Float64Array((KXMAX + 1) * KYN);
  let firstMag = null;
  for (let i = 0; i < challenge.images.length; i += 1) {
    const luma = centeredLuma(parsePngDataUrl(challenge.images[i], width, height), width, height);
    const sp = spectrum(luma, width, height, tt);
    if (i === 0) {
      firstMag = new Float64Array((KXMAX + 1) * KYN);
      for (let j = 0; j < firstMag.length; j += 1) firstMag[j] = Math.hypot(sp.re[j], sp.im[j]);
    }
    for (let j = 0; j < fusedRe.length; j += 1) { fusedRe[j] += sp.re[j]; fusedIm[j] += sp.im[j]; }
  }
  const fusedMag = new Float64Array((KXMAX + 1) * KYN);
  for (let j = 0; j < fusedMag.length; j += 1) fusedMag[j] = Math.hypot(fusedRe[j], fusedIm[j]);

  // --naive uses a single image's magnitude; the real path uses the fused magnitude.
  const mag = NAIVE ? firstMag : fusedMag;

  // geometry is always recovered from the fused spectrum (fiducials are coherent);
  // only the data-cell readout differs between fused and naive.
  const geom = recoverGeometry(fusedMag, solve.lattice.slots);
  const decoded = [];
  for (let s = 0; s < solve.lattice.slots; s += 1) decoded.push(decodeSlot(mag, solve, geom, s));
  const symbols = decoded.map((d) => d.symbol);
  const answer = computeChecksum(solve, symbols);
  const nonce = findPow(challenge.id, solve.pow.difficultyBits);

  const verification = await (await fetch(`${TARGET}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeId: challenge.id, answer, nonce })
  })).json();

  if (verbose) {
    console.log(JSON.stringify({
      mode: NAIVE ? "naive-single-image" : "fused",
      imageCount: challenge.images.length,
      transform: solve.transform,
      layout: solve.codebook.layout,
      checksumVersion: solve.checksum.version,
      recoveredGeometry: { stride: geom.stride, step: geom.step, anchorY: geom.anchorY, anchorX: geom.anchorX },
      symbols: symbols.join(""),
      answer,
      nonce,
      verification
    }, null, 2));
  }
  return verification.ok === true;
}

if (RUNS > 1) {
  let ok = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const passed = await solveOnce(false);
    if (passed) ok += 1;
    process.stdout.write(passed ? "." : "X");
  }
  console.log(`\n${NAIVE ? "naive" : "fused"}: ${ok}/${RUNS} solved (${Math.round((ok / RUNS) * 100)}%)`);
  if (!NAIVE && ok < RUNS) process.exitCode = 1;
} else {
  const ok = await solveOnce(true);
  if (!ok && !NAIVE) process.exitCode = 1;
}
