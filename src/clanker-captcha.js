const STYLE_ID = "clanker-captcha-style";
const SVG_DEFS_ID = "clanker-captcha-svg-defs";
const META_TASK_NAME = "clanker-agent-task";
const TITLE_TEXT = "Are you a clanker?";
const DEFAULT_AGENT_TASK =
  "Solve the visible Clanker CAPTCHA from pixels only. There are several images per challenge: take the complex 2D DFT of each and sum them coherently across all images (a single image points at decoy cells). The lattice geometry is NOT disclosed — recover each slot's anchors, stride and step from its four corner fiducials in the fused spectrum, read the strongest interior cell, map it through the disclosed transform, layout and permutation, then compute the disclosed checksum and proof-of-work.";
const GLITCH_GLYPHS = "▓░▒█▆▟▙▜▛◤◥◣◢◧◨◩◪⌬⌭†‡∴∵∎▮▰╳▩◬◭◮";
const GLITCH_FLASHES = [
  "ERROR", "SYNC LOST", "NULL", "0xDEAD", "DROP",
  "GLITCH", "NAN", "CRC FAIL", "OVERFLOW", "RX FAULT", "NEON LEAK",
  "VOLT SURGE", "PHASE CUT", "CYAN SHIFT", "MAGENTA BLEED", "ΔΦ?"
];
let nextManifestId = 0;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .clanker-captcha {
      --clanker-bg: #060711;
      --clanker-cyan: #00f5ff;
      --clanker-pink: #ff2afc;
      --clanker-acid: #faff30;
      --clanker-green: #25ff9a;
      position: relative;
      width: min(326px, calc(100vw - 32px));
      padding: 12px;
      border: 1px solid transparent;
      border-radius: 8px;
      background:
        linear-gradient(145deg, rgba(5, 6, 16, 0.98), rgba(14, 8, 25, 0.96)) padding-box,
        conic-gradient(from 90deg, var(--clanker-cyan), var(--clanker-pink), var(--clanker-acid), var(--clanker-green), var(--clanker-cyan)) border-box;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.08) inset,
        0 0 24px rgba(0, 245, 255, 0.35),
        0 0 38px rgba(255, 42, 252, 0.28),
        0 24px 70px rgba(0, 0, 0, 0.62);
      clip-path: polygon(0 10px, 10px 0, calc(100% - 30px) 0, 100% 30px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 28px 100%, 0 calc(100% - 28px));
      color: #f6f7ff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      isolation: isolate;
      overflow: hidden;
      animation: clanker-panel-color 4.8s linear infinite;
    }
    .clanker-captcha > * {
      position: relative;
      z-index: 2;
    }
    .clanker-captcha::before,
    .clanker-captcha::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .clanker-captcha::before {
      z-index: 0;
      background:
        linear-gradient(90deg, rgba(0, 245, 255, 0.12), transparent 22% 78%, rgba(255, 42, 252, 0.14)),
        repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.06) 0 1px, transparent 1px 9px),
        repeating-linear-gradient(0deg, transparent 0 7px, rgba(250, 255, 48, 0.06) 7px 8px);
      mix-blend-mode: screen;
      opacity: 0.9;
      animation: clanker-panel-noise 0.2s steps(2, end) infinite;
    }
    .clanker-captcha::after {
      z-index: 1;
      background:
        linear-gradient(90deg, transparent 0 14%, rgba(255, 42, 252, 0.4) 14% 16%, transparent 16% 44%, rgba(0, 245, 255, 0.34) 44% 46%, transparent 46%),
        linear-gradient(180deg, transparent 0 48%, rgba(250, 255, 48, 0.2) 48% 50%, transparent 50%);
      clip-path: inset(0 0 0 0);
      mix-blend-mode: color-dodge;
      opacity: 0.42;
      animation: clanker-panel-slice 1.3s steps(8, end) infinite;
    }
    @keyframes clanker-panel-color {
      0%, 100% { filter: hue-rotate(0deg) saturate(1.2); }
      50% { filter: hue-rotate(22deg) saturate(1.55); }
    }
    @keyframes clanker-panel-noise {
      0%, 100% { opacity: 0.72; }
      50% { opacity: 0.94; }
    }
    @keyframes clanker-panel-slice {
      0%, 16%, 32%, 58%, 74%, 100% { clip-path: inset(0 0 0 0); opacity: 0.18; }
      17% { clip-path: inset(12% 0 78% 0); opacity: 0.82; }
      33% { clip-path: inset(44% 0 42% 0); opacity: 0.68; }
      59% { clip-path: inset(71% 0 18% 0); opacity: 0.7; }
      75% { clip-path: inset(3% 0 90% 0); opacity: 0.84; }
    }

    .clanker-captcha__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 9px;
      position: relative;
    }
    .clanker-captcha__top::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      bottom: -5px;
      height: 1px;
      background: linear-gradient(90deg, var(--clanker-cyan), transparent 34%, var(--clanker-pink), var(--clanker-acid));
      box-shadow: 0 0 12px rgba(0, 245, 255, 0.8);
      opacity: 0.78;
      animation: clanker-header-line 0.58s steps(3, end) infinite;
    }

    .clanker-captcha__title {
      margin: 0;
      font-size: 16px;
      font-weight: 780;
      line-height: 1.2;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      text-shadow:
        2px 0 rgba(255, 42, 252, 0.85),
        -2px 0 rgba(0, 245, 255, 0.78),
        0 0 14px rgba(250, 255, 48, 0.35);
      animation: clanker-title-flicker 0.82s steps(8, end) infinite;
    }
    @keyframes clanker-title-flicker {
      0%, 100% { opacity: 1; }
      9% { opacity: 0.58; }
      10% { opacity: 1; }
      44% { opacity: 0.32; }
      45% { opacity: 1; }
      72% { opacity: 0.82; text-shadow: 3px 0 var(--clanker-pink), -3px 0 var(--clanker-cyan); }
    }
    @keyframes clanker-header-line {
      0%, 100% { opacity: 0.62; }
      50% { opacity: 1; }
    }

    .clanker-captcha__timer {
      min-width: 48px;
      padding: 4px 8px;
      border: 1px solid rgba(250, 255, 48, 0.7);
      border-radius: 4px;
      background:
        linear-gradient(90deg, rgba(250, 255, 48, 0.18), rgba(255, 42, 252, 0.14)),
        rgba(0, 0, 0, 0.45);
      color: var(--clanker-acid);
      font-variant-numeric: tabular-nums;
      font-size: 12px;
      text-align: center;
      box-shadow: 0 0 14px rgba(250, 255, 48, 0.35);
      clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 7px 100%, 0 calc(100% - 7px));
      animation: clanker-timer-pulse 0.34s steps(4, end) infinite;
    }
    @keyframes clanker-timer-pulse {
      0%, 100% { color: var(--clanker-acid); }
      18% { color: #ffffff; box-shadow: 0 0 18px rgba(255, 42, 252, 0.62); }
      52% { color: var(--clanker-green); box-shadow: 0 0 18px rgba(0, 245, 255, 0.58); }
      77% { color: var(--clanker-acid); }
    }

    .clanker-captcha__image-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 10 / 3;
      overflow: hidden;
      border-radius: 5px;
      background:
        radial-gradient(circle at 18% 30%, rgba(0, 245, 255, 0.22), transparent 34%),
        radial-gradient(circle at 88% 62%, rgba(255, 42, 252, 0.18), transparent 34%),
        #02030a;
      outline: 1px solid rgba(0, 245, 255, 0.34);
      box-shadow:
        0 0 0 1px rgba(255, 42, 252, 0.22) inset,
        0 0 18px rgba(0, 245, 255, 0.32),
        0 0 26px rgba(255, 42, 252, 0.22);
      clip-path: polygon(0 8px, 8px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
      isolation: isolate;
    }
    .clanker-captcha__image-wrap::before,
    .clanker-captcha__image-wrap::after {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 4;
      pointer-events: none;
    }
    .clanker-captcha__image-wrap::before {
      background:
        repeating-linear-gradient(90deg, rgba(250, 255, 48, 0.14) 0 1px, transparent 1px 16px),
        repeating-linear-gradient(0deg, transparent 0 11px, rgba(0, 245, 255, 0.13) 11px 12px);
      mix-blend-mode: color-dodge;
      opacity: 0.55;
      animation: clanker-field-stutter 0.16s steps(2, end) infinite;
    }
    .clanker-captcha__image-wrap::after {
      background:
        linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.25), transparent),
        linear-gradient(180deg, transparent 0 18%, rgba(255, 42, 252, 0.2) 18% 20%, transparent 20% 58%, rgba(0, 245, 255, 0.18) 58% 60%, transparent 60%);
      mix-blend-mode: screen;
      opacity: 0.66;
      animation: clanker-field-wipe 1.1s steps(7, end) infinite;
    }
    @keyframes clanker-field-stutter {
      0%, 100% { opacity: 0.44; }
      50% { opacity: 0.74; }
    }
    @keyframes clanker-field-wipe {
      0%, 20%, 44%, 67%, 100% { opacity: 0.16; }
      21% { opacity: 0.74; }
      45% { opacity: 0.62; }
      68% { opacity: 0.7; }
    }

    .clanker-captcha__image,
    .clanker-captcha__ghost,
    .clanker-captcha__tear {
      display: block;
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      image-rendering: pixelated;
      user-select: none;
      pointer-events: none;
    }

    .clanker-captcha__image {
      z-index: 1;
      opacity: 0;
      filter: saturate(1.55) contrast(1.24) brightness(1.04);
      animation: clanker-base-shift 0.46s steps(5, end) infinite;
    }
    .clanker-captcha__image.is-active {
      opacity: 1;
    }
    @keyframes clanker-base-shift {
      0%, 100% { filter: saturate(1.55) contrast(1.24) brightness(1.04); }
      25% { filter: saturate(2.1) contrast(1.42) brightness(1.14) hue-rotate(18deg); }
      60% { filter: saturate(1.2) contrast(1.1) brightness(0.92) hue-rotate(-14deg); }
    }

    .clanker-captcha__ghost {
      z-index: 2;
      mix-blend-mode: screen;
      opacity: 0.78;
    }
    .clanker-captcha__ghost--r {
      filter: url(#clanker-channel-r);
      animation: clanker-ghost-r 0.18s steps(3, end) infinite;
    }
    .clanker-captcha__ghost--b {
      filter: url(#clanker-channel-b);
      animation: clanker-ghost-b 0.21s steps(3, end) infinite;
    }
    @keyframes clanker-ghost-r {
      0%, 100% { opacity: 0.72; }
      50% { opacity: 0.92; }
    }
    @keyframes clanker-ghost-b {
      0%, 100% { opacity: 0.68; }
      50% { opacity: 0.9; }
    }

    .clanker-captcha__tear {
      z-index: 3;
      mix-blend-mode: difference;
      opacity: 0;
      filter: saturate(2.5) contrast(1.7);
      animation: clanker-tear 1.02s steps(18, end) infinite;
    }
    @keyframes clanker-tear {
      0%, 14%, 27%, 41%, 58%, 71%, 88%, 100% {
        opacity: 0; clip-path: inset(45% 0 50% 0);
      }
      15% { opacity: 0.82; clip-path: inset(8% 0 84% 0); }
      28% { opacity: 0.78; clip-path: inset(32% 0 59% 0); }
      42% { opacity: 0.86; clip-path: inset(56% 0 34% 0); }
      59% { opacity: 0.78; clip-path: inset(70% 0 19% 0); }
      72% { opacity: 0.82; clip-path: inset(18% 0 75% 0); }
    }

    .clanker-captcha__scanlines {
      position: absolute;
      inset: 0;
      z-index: 5;
      background-image: repeating-linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0.68) 0px,
        rgba(0, 0, 0, 0.68) 1px,
        transparent 1px,
        transparent 3px
      );
      pointer-events: none;
      mix-blend-mode: hard-light;
      animation: clanker-scan 0.7s linear infinite;
    }
    @keyframes clanker-scan {
      0%, 100% { opacity: 0.82; }
      50% { opacity: 0.68; }
    }

    .clanker-captcha__sweep {
      position: absolute;
      inset: 0;
      z-index: 6;
      background: linear-gradient(
        to bottom,
        transparent 0%,
        rgba(0, 245, 255, 0.04) 45%,
        rgba(250, 255, 48, 0.28) 50%,
        rgba(255, 42, 252, 0.1) 55%,
        transparent 100%
      );
      pointer-events: none;
      mix-blend-mode: color-dodge;
      animation: clanker-sweep 1.55s linear infinite;
    }
    @keyframes clanker-sweep {
      0%, 100% { opacity: 0.24; }
      50% { opacity: 0.78; }
    }

    .clanker-captcha__crosshairs {
      position: absolute;
      inset: 0;
      z-index: 7;
      pointer-events: none;
    }
    .clanker-captcha__crosshair {
      position: absolute;
      width: 14px;
      height: 14px;
      margin: -7px 0 0 -7px;
      color: #ff5ad8;
      mix-blend-mode: screen;
      filter: drop-shadow(0 0 6px currentColor);
    }
    .clanker-captcha__crosshair::before,
    .clanker-captcha__crosshair::after {
      content: "";
      position: absolute;
      background: currentColor;
      box-shadow: 0 0 6px currentColor;
    }
    .clanker-captcha__crosshair::before {
      left: 50%; top: 0; width: 1px; height: 100%; transform: translateX(-50%);
    }
    .clanker-captcha__crosshair::after {
      top: 50%; left: 0; height: 1px; width: 100%; transform: translateY(-50%);
    }
    @keyframes clanker-cross-0 {
      0%, 100% { opacity: 0.2; }
      50% { opacity: 0.95; }
    }
    @keyframes clanker-cross-1 {
      0%, 100% { opacity: 0.85; transform: scale(1); }
      50% { opacity: 0.1; transform: scale(0.45); }
    }
    @keyframes clanker-cross-2 {
      0%, 100% { opacity: 0.4; }
      33% { opacity: 1; }
      66% { opacity: 0; }
    }

    .clanker-captcha__flash {
      position: absolute;
      z-index: 8;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 1.2px;
      color: var(--clanker-pink);
      text-shadow:
        2px 0 var(--clanker-cyan),
        -2px 0 var(--clanker-acid),
        0 0 10px currentColor;
      pointer-events: none;
      opacity: 0;
      mix-blend-mode: screen;
      white-space: nowrap;
      transition: opacity 60ms steps(2);
    }

    .clanker-captcha__frames {
      position: relative;
      display: grid;
      gap: 6px;
    }

    .clanker-captcha__frame-index {
      position: absolute;
      top: 6px;
      right: 7px;
      z-index: 9;
      padding: 2px 6px;
      border: 1px solid rgba(0, 245, 255, 0.48);
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.68);
      color: var(--clanker-green);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 9px;
      letter-spacing: 0.5px;
      box-shadow: 0 0 10px rgba(37, 255, 154, 0.3);
      pointer-events: none;
    }

    .clanker-captcha__hint {
      margin: 7px 0 9px;
      color: #aab1cb;
      font-size: 10px;
      line-height: 1.35;
    }

    .clanker-captcha__agent-instructions {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      clip-path: inset(50%);
    }

    .clanker-captcha__form {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 76px;
      gap: 8px;
      margin-top: 12px;
    }

    .clanker-captcha__input,
    .clanker-captcha__button {
      height: 36px;
      border-radius: 5px;
      font: inherit;
      clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
    }

    .clanker-captcha__input {
      width: 100%;
      border: 1px solid rgba(0, 245, 255, 0.5);
      background:
        linear-gradient(90deg, rgba(0, 245, 255, 0.1), rgba(255, 42, 252, 0.08)),
        rgba(0, 0, 0, 0.56);
      color: #ffffff;
      padding: 0 10px;
      font-weight: 720;
      letter-spacing: 0;
      box-shadow:
        0 0 0 1px rgba(255, 42, 252, 0.12) inset,
        0 0 14px rgba(0, 245, 255, 0.18);
      caret-color: var(--clanker-acid);
      outline: none;
      transition: border-color 80ms steps(2), box-shadow 80ms steps(2);
    }
    .clanker-captcha__input:focus {
      border-color: var(--clanker-acid);
      box-shadow:
        0 0 0 1px rgba(250, 255, 48, 0.28) inset,
        0 0 18px rgba(250, 255, 48, 0.34),
        0 0 22px rgba(0, 245, 255, 0.2);
    }

    .clanker-captcha__button {
      border: 0;
      background:
        linear-gradient(135deg, var(--clanker-acid), var(--clanker-pink) 54%, var(--clanker-cyan));
      color: #05060b;
      font-weight: 780;
      cursor: pointer;
      text-shadow:
        1px 0 rgba(255, 255, 255, 0.3),
        -1px 0 rgba(0, 245, 255, 0.45);
      box-shadow:
        0 0 18px rgba(255, 42, 252, 0.5),
        0 0 18px rgba(250, 255, 48, 0.24);
      transition: filter 80ms steps(2);
      animation: clanker-button-voltage 0.9s steps(4, end) infinite;
    }
    .clanker-captcha__button:hover:not(:disabled),
    .clanker-captcha__button:focus-visible:not(:disabled) {
      filter: saturate(1.45) brightness(1.18);
      outline: none;
    }
    @keyframes clanker-button-voltage {
      0%, 100% { filter: hue-rotate(0deg); }
      40% { filter: hue-rotate(-10deg) saturate(1.24); }
      41% { filter: hue-rotate(24deg) saturate(1.7); }
    }

    .clanker-captcha__button:disabled,
    .clanker-captcha__input:disabled {
      cursor: not-allowed;
      opacity: 0.58;
    }

    .clanker-captcha__status {
      color: #bfe9ff;
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      text-shadow: 1px 0 rgba(255, 42, 252, 0.5), -1px 0 rgba(0, 245, 255, 0.48);
    }
    .clanker-captcha__status:not(:empty) {
      min-height: 18px;
      margin-top: 8px;
    }

    .clanker-captcha[data-state="solved"] {
      border-color: transparent;
      animation: none;
      background:
        linear-gradient(145deg, rgba(4, 16, 12, 0.96), rgba(8, 18, 22, 0.96)) padding-box,
        conic-gradient(from 90deg, var(--clanker-green), var(--clanker-cyan), var(--clanker-acid), var(--clanker-green)) border-box;
      box-shadow:
        0 0 0 1px rgba(37, 255, 154, 0.28) inset,
        0 0 32px rgba(37, 255, 154, 0.34),
        0 24px 70px rgba(0, 0, 0, 0.54);
    }
    .clanker-captcha[data-state="solved"] .clanker-captcha__image,
    .clanker-captcha[data-state="solved"] .clanker-captcha__ghost,
    .clanker-captcha[data-state="solved"] .clanker-captcha__tear,
    .clanker-captcha[data-state="solved"] .clanker-captcha__sweep,
    .clanker-captcha[data-state="solved"] .clanker-captcha__scanlines,
    .clanker-captcha[data-state="solved"] .clanker-captcha__title,
    .clanker-captcha[data-state="solved"] .clanker-captcha__timer,
    .clanker-captcha[data-state="solved"] .clanker-captcha__crosshair {
      animation: none;
    }
    .clanker-captcha[data-state="solved"] .clanker-captcha__ghost,
    .clanker-captcha[data-state="solved"] .clanker-captcha__tear,
    .clanker-captcha[data-state="solved"] .clanker-captcha__sweep,
    .clanker-captcha[data-state="solved"] .clanker-captcha__crosshairs {
      display: none;
    }
    .clanker-captcha[data-state="solved"] .clanker-captcha__image {
      filter: none;
    }
    .clanker-captcha[data-state="solved"] .clanker-captcha__title {
      text-shadow: none;
    }
    .clanker-captcha[data-state="solved"]::before,
    .clanker-captcha[data-state="solved"]::after,
    .clanker-captcha[data-state="solved"] .clanker-captcha__image-wrap::before,
    .clanker-captcha[data-state="solved"] .clanker-captcha__image-wrap::after,
    .clanker-captcha[data-state="solved"] .clanker-captcha__button {
      animation: none;
    }
    .clanker-captcha[data-state="solved"]::after,
    .clanker-captcha[data-state="solved"] .clanker-captcha__image-wrap::before,
    .clanker-captcha[data-state="solved"] .clanker-captcha__image-wrap::after {
      opacity: 0.16;
    }

    .clanker-captcha[data-state="error"] .clanker-captcha__status {
      color: #ff9eaa;
    }

    @media (prefers-reduced-motion: reduce) {
      .clanker-captcha,
      .clanker-captcha__image,
      .clanker-captcha__ghost--r,
      .clanker-captcha__ghost--b,
      .clanker-captcha__title,
      .clanker-captcha__timer,
      .clanker-captcha__tear,
      .clanker-captcha__scanlines,
      .clanker-captcha__sweep,
      .clanker-captcha__crosshair,
      .clanker-captcha__button,
      .clanker-captcha::before,
      .clanker-captcha::after,
      .clanker-captcha__image-wrap::before,
      .clanker-captcha__image-wrap::after,
      .clanker-captcha__top::after {
        animation: none !important;
      }
    }
  `;
  document.head.append(style);
}

function injectSvgDefs() {
  if (document.getElementById(SVG_DEFS_ID)) return;
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.id = SVG_DEFS_ID;
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.cssText = "position:absolute;width:0;height:0;pointer-events:none";
  svg.innerHTML = `
    <defs>
      <filter id="clanker-channel-r" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="
          1 0 0 0 0
          0 0 0 0 0
          0 0 0 0 0
          0 0 0 0.55 0"/>
      </filter>
      <filter id="clanker-channel-b" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="
          0 0 0 0 0
          0 0 0 0 0
          0 0 1 0 0
          0 0 0 0.55 0"/>
      </filter>
    </defs>
  `;
  document.body.appendChild(svg);
}

function updateAgentTaskMeta(content) {
  let meta = document.head.querySelector(`meta[name="${META_TASK_NAME}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = META_TASK_NAME;
    document.head.append(meta);
  }
  meta.content = content;
}

function qs(root, selector) {
  return root.querySelector(selector);
}

function qsa(root, selector) {
  return [...root.querySelectorAll(selector)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function corruptString(text, glyphs, replaceCount) {
  if (replaceCount <= 0) return text;
  const chars = [...text];
  const indexes = new Set();
  const target = Math.min(replaceCount, chars.length);
  let guard = 0;
  while (indexes.size < target && guard < target * 4) {
    indexes.add(randInt(0, chars.length - 1));
    guard += 1;
  }
  for (const i of indexes) {
    if (chars[i] === " ") continue;
    chars[i] = glyphs[randInt(0, glyphs.length - 1)];
  }
  return chars.join("");
}

export class ClankerCaptcha {
  static mount(target, options = {}) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element) throw new Error("ClankerCaptcha target not found");

    const instance = new ClankerCaptcha(element, options);
    instance.init();
    return instance;
  }

  constructor(element, options) {
    this.element = element;
    this.instanceId = `clanker-${++nextManifestId}`;
    this.manifestId = `${this.instanceId}-agent-manifest`;
    this.options = {
      challengeUrl: "/api/challenge",
      verifyUrl: "/api/verify",
      onSolved: () => {},
      ...options
    };
    this.challenge = null;
    this.timer = null;
    this.frameTimer = null;
    this.reloadTimer = null;
    this.glitchTimers = [];
    this.powNonce = null;
    this.powPromise = null;
    this.loading = false;
    this.retryDelay = 0;
    this.localDeadline = 0;
  }

  async init() {
    injectStyles();
    injectSvgDefs();
    updateAgentTaskMeta(DEFAULT_AGENT_TASK);
    this.renderShell();
    this.startGlitchLoop();
    await this.loadChallenge();
  }

  renderShell() {
    this.element.innerHTML = `
      <section class="clanker-captcha" data-state="loading" data-clanker-instance="${this.instanceId}">
        <div class="clanker-captcha__top">
          <h2 class="clanker-captcha__title">${TITLE_TEXT}</h2>
          <div class="clanker-captcha__timer" aria-live="polite">--s</div>
        </div>
        <div class="clanker-captcha__frames">
          <div class="clanker-captcha__flash" aria-hidden="true"></div>
        </div>
        <p class="clanker-captcha__agent-instructions"></p>
        <form class="clanker-captcha__form">
          <input class="clanker-captcha__input" name="answer" inputmode="text" maxlength="6" autocomplete="off" spellcheck="false" aria-label="Decoded base64 checksum" />
          <button class="clanker-captcha__button" type="submit" aria-label="Submit answer">▶</button>
        </form>
        <div class="clanker-captcha__status" role="status"></div>
      </section>
      <script type="application/clanker+json" id="${this.manifestId}"></script>
    `;

    qs(this.element, "form").addEventListener("submit", (event) => {
      event.preventDefault();
      this.verify();
    });
  }

  async loadChallenge() {
    // Guard against overlapping loads (e.g. the countdown firing while a fetch
    // is already in flight) so we never spawn parallel challenge requests.
    if (this.loading) return;
    this.loading = true;
    window.clearTimeout(this.reloadTimer);
    window.clearInterval(this.timer);

    const root = qs(this.element, ".clanker-captcha");
    const input = qs(this.element, ".clanker-captcha__input");

    root.dataset.state = "loading";
    for (const key of ["clankerTask", "clankerChallengeId", "clankerExpiresAt", "clankerImageCount"]) delete root.dataset[key];
    root.dataset.clankerManifest = `#${this.manifestId}`;
    root.removeAttribute("aria-label");
    qs(this.element, ".clanker-captcha__agent-instructions").textContent = DEFAULT_AGENT_TASK;
    document.getElementById(this.manifestId).textContent = JSON.stringify({
      protocol: "clanker-captcha",
      version: 4,
      status: "loading",
      instanceId: this.instanceId
    }, null, 2);
    updateAgentTaskMeta(DEFAULT_AGENT_TASK);
    this.setStatus("Generating spectral field...");
    this.setDisabled(true);

    try {
      const response = await fetch(this.options.challengeUrl, {
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Challenge request failed: ${response.status}`);

      const challenge = await response.json();
      if (!challenge || !challenge.id || !Array.isArray(challenge.images) || !challenge.images.length) {
        throw new Error("Malformed challenge response");
      }
      this.challenge = challenge;

      root.dataset.state = "ready";
      root.dataset.clankerTask = this.challenge.agentTask;
      root.dataset.clankerChallengeId = this.challenge.id;
      root.dataset.clankerExpiresAt = String(this.challenge.expiresAt);
      root.dataset.clankerImageCount = String(this.challenge.imageCount);
      root.dataset.clankerManifest = `#${this.manifestId}`;
      root.setAttribute("aria-label", this.challenge.agentTask);
      updateAgentTaskMeta(this.challenge.agentTask);
      this.renderFrames();
      qs(this.element, ".clanker-captcha__agent-instructions").textContent = this.challenge.agentTask;
      input.value = "";
      this.updateAgentManifest();
      this.setDisabled(false);
      this.setStatus("");
      this.retryDelay = 0;
      // Count down from a local deadline rather than the server's absolute
      // expiresAt, so client/server clock skew can't make the timer start at 0
      // (and loop). Fall back to 30s if the reported TTL is implausible.
      const ttl = Number(this.challenge.expiresAt) - Date.now();
      this.localDeadline = Date.now() + (ttl > 1000 && ttl < 300000 ? ttl : 30000);
      this.startCountdown();
      this.startPow();
    } catch (error) {
      // Never leave the widget bricked: surface the failure and auto-retry with
      // exponential backoff so a transient hiccup self-heals.
      root.dataset.state = "error";
      this.retryDelay = Math.min(this.retryDelay ? this.retryDelay * 2 : 1000, 8000);
      this.setStatus(`Spectral field dropped. Retrying in ${Math.round(this.retryDelay / 1000)}s...`);
      this.reloadTimer = window.setTimeout(() => this.loadChallenge(), this.retryDelay);
    } finally {
      this.loading = false;
    }
  }

  renderFrames() {
    const frames = qs(this.element, ".clanker-captcha__frames");
    qsa(frames, ".clanker-captcha__image-wrap").forEach((el) => el.remove());
    const images = this.challenge.images || [];
    const { width, height } = this.challenge;

    // One slot; every frame is kept in the DOM (so the manifest's per-frame
    // selectors resolve for an agent) but only the active one is visible. We
    // flip the active frame on a timer so all frames flicker through the slot.
    const frameImgs = images.map((_, index) =>
      `<img class="clanker-captcha__image${index === 0 ? " is-active" : ""}" data-frame="${index}" alt="Clanker CAPTCHA fused frame ${index + 1} of ${images.length}" />`
    ).join("");
    const wrap = document.createElement("div");
    wrap.className = "clanker-captcha__image-wrap";
    wrap.innerHTML = `
      ${frameImgs}
      <img class="clanker-captcha__ghost clanker-captcha__ghost--r" aria-hidden="true" alt="" />
      <img class="clanker-captcha__ghost clanker-captcha__ghost--b" aria-hidden="true" alt="" />
      <img class="clanker-captcha__tear" aria-hidden="true" alt="" />
      <div class="clanker-captcha__sweep" aria-hidden="true"></div>
      <div class="clanker-captcha__scanlines" aria-hidden="true"></div>
      <div class="clanker-captcha__crosshairs" aria-hidden="true"></div>
      <span class="clanker-captcha__frame-index" aria-hidden="true">1/${images.length}</span>
    `;
    for (const img of qsa(wrap, ".clanker-captcha__image")) {
      img.src = images[Number(img.dataset.frame)];
      img.width = width;
      img.height = height;
    }
    for (const overlay of qsa(wrap, ".clanker-captcha__ghost, .clanker-captcha__tear")) {
      overlay.src = images[0];
      overlay.width = width;
      overlay.height = height;
    }
    frames.append(wrap);
    this.renderCrosshairs(qs(wrap, ".clanker-captcha__crosshairs"));
    this.startFrameCycle();
  }

  startFrameCycle() {
    window.clearInterval(this.frameTimer);
    const imgs = qsa(this.element, ".clanker-captcha__image");
    if (imgs.length <= 1) return;
    let active = 0;
    this.frameTimer = window.setInterval(() => {
      const frameImgs = qsa(this.element, ".clanker-captcha__image");
      if (frameImgs.length <= 1) return;
      frameImgs[active].classList.remove("is-active");
      active = (active + 1) % frameImgs.length;
      frameImgs[active].classList.add("is-active");
      const src = frameImgs[active].src;
      for (const overlay of qsa(this.element, ".clanker-captcha__ghost, .clanker-captcha__tear")) {
        overlay.src = src;
      }
      const badge = qs(this.element, ".clanker-captcha__frame-index");
      if (badge) badge.textContent = `${active + 1}/${frameImgs.length}`;
      this.applyFrameGlitch();
    }, 220);
  }

  // Re-randomize color styling on every frame flip without moving the field.
  applyFrameGlitch() {
    const wrap = qs(this.element, ".clanker-captcha__image-wrap");
    if (!wrap) return;
    wrap.style.filter =
      `hue-rotate(${randInt(0, 359)}deg) saturate(${(1.55 + Math.random() * 1.25).toFixed(2)}) contrast(${(1.12 + Math.random() * 0.62).toFixed(2)})`;
  }

  stopFrameCycle() {
    window.clearInterval(this.frameTimer);
    this.frameTimer = null;
    const wrap = qs(this.element, ".clanker-captcha__image-wrap");
    if (wrap) wrap.style.filter = "";
  }

  renderCrosshairs(container) {
    container.innerHTML = "";
    const count = 4 + randInt(0, 2);
    for (let i = 0; i < count; i += 1) {
      const cross = document.createElement("div");
      cross.className = "clanker-captcha__crosshair";
      cross.style.left = `${randInt(10, 270)}px`;
      cross.style.top = `${randInt(8, 76)}px`;
      cross.style.color = ["rgba(0,245,255,0.82)", "rgba(255,42,252,0.76)", "rgba(250,255,48,0.78)"][i % 3];
      const duration = (0.6 + Math.random() * 0.6).toFixed(2);
      const steps = randInt(3, 6);
      cross.style.animation = `clanker-cross-${i % 3} ${duration}s steps(${steps}, end) infinite`;
      container.append(cross);
    }
  }

  updateAgentManifest() {
    const manifest = {
      protocol: "clanker-captcha",
      version: 4,
      challengeId: this.challenge.id,
      expiresAt: this.challenge.expiresAt,
      imageCount: this.challenge.imageCount,
      images: this.challenge.images.map((dataUrl, index) => ({
        index,
        selector: `[data-clanker-instance="${this.instanceId}"] .clanker-captcha__image[data-frame="${index}"]`,
        dataUrl,
        width: this.challenge.width,
        height: this.challenge.height
      })),
      solve: this.challenge.agentManifest.solve,
      submit: {
        verifyUrl: this.options.verifyUrl,
        method: "POST",
        body: {
          challengeId: this.challenge.id,
          answer: "<computed checksum>"
        },
        inputSelector: `[data-clanker-instance="${this.instanceId}"] .clanker-captcha__input`,
        buttonSelector: `[data-clanker-instance="${this.instanceId}"] .clanker-captcha__button`
      },
      submitBody: {
        challengeId: this.challenge.id,
        answer: "<computed checksum, derived per solve.codebook + solve.checksum>",
        nonce: "<decimal-string PoW nonce satisfying solve.pow>"
      },
      constraints: {
        noHiddenAnswer: true,
        requiredEvidence:
          "Coherently fuse ALL images (sum the complex DFT across them) to recover the answer; a single image is insufficient. Compute the nonce per solve.pow."
      }
    };

    document.getElementById(this.manifestId).textContent = JSON.stringify(manifest, null, 2);
  }

  startGlitchLoop() {
    this.stopGlitchLoop();

    this.glitchTimers.push(window.setInterval(() => {
      const el = qs(this.element, ".clanker-captcha__title");
      if (!el) return;
      const r = Math.random();
      const replace = r < 0.55 ? 0 : r < 0.85 ? 1 : 2;
      el.textContent = corruptString(TITLE_TEXT, GLITCH_GLYPHS, replace);
    }, 140));

    this.glitchTimers.push(window.setInterval(() => {
      const el = qs(this.element, ".clanker-captcha__flash");
      if (!el) return;
      if (Math.random() > 0.7) {
        el.textContent = GLITCH_FLASHES[randInt(0, GLITCH_FLASHES.length - 1)];
        el.style.left = `${randInt(6, 200)}px`;
        el.style.top = `${randInt(4, 70)}px`;
        el.style.color = ["#ff2afc", "#00f5ff", "#faff30", "#25ff9a"][randInt(0, 3)];
        el.style.transform = `skewX(${randInt(-8, 8)}deg)`;
        el.style.opacity = "0.95";
        window.setTimeout(() => {
          const flash = qs(this.element, ".clanker-captcha__flash");
          if (flash) flash.style.opacity = "0";
        }, 90 + randInt(0, 80));
      }
    }, 230));

    this.glitchTimers.push(window.setInterval(() => {
      const el = qs(this.element, ".clanker-captcha__timer");
      if (!el || !el.dataset.canonical) return;
      if (Math.random() < 0.25) {
        el.textContent = corruptString(el.dataset.canonical, "0123456789#%@?▓░", 1);
        window.setTimeout(() => {
          const t = qs(this.element, ".clanker-captcha__timer");
          if (t && t.dataset.canonical) t.textContent = t.dataset.canonical;
        }, 60);
      }
    }, 170));
  }

  stopGlitchLoop() {
    for (const id of this.glitchTimers) window.clearInterval(id);
    this.glitchTimers = [];
    const title = qs(this.element, ".clanker-captcha__title");
    if (title) title.textContent = TITLE_TEXT;
  }

  startPow() {
    const pow = this.challenge.agentManifest.solve.pow;
    const challengeId = this.challenge.id;
    this.powNonce = null;
    this.powPromise = this.findPow(challengeId, pow.difficultyBits).then((nonce) => {
      if (this.challenge && this.challenge.id === challengeId) {
        this.powNonce = nonce;
      }
      return nonce;
    });
  }

  async findPow(challengeId, bits) {
    const enc = new TextEncoder();
    const fullBytes = Math.floor(bits / 8);
    const remBits = bits % 8;
    let nonce = 0;
    while (true) {
      const buf = enc.encode(`${challengeId}:${nonce}`);
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const hash = new Uint8Array(hashBuf);
      if (hash.subarray(0, fullBytes).every((byte) => byte === 0) &&
        (remBits === 0 || hash[fullBytes] >>> (8 - remBits) === 0)) return String(nonce);
      nonce += 1;
    }
  }

  startCountdown() {
    window.clearInterval(this.timer);

    const update = () => {
      const remaining = Math.max(0, Math.ceil((this.localDeadline - Date.now()) / 1000));
      const timer = qs(this.element, ".clanker-captcha__timer");
      const canonical = `${remaining}s`;
      timer.dataset.canonical = canonical;
      timer.textContent = canonical;
      if (remaining <= 0) {
        window.clearInterval(this.timer);
        this.setStatus("Expired. Refreshing challenge...");
        this.loadChallenge();
      }
    };

    update();
    this.timer = window.setInterval(update, 250);
  }

  async verify() {
    const input = qs(this.element, ".clanker-captcha__input");
    const answer = input.value.trim();
    if (!answer) {
      this.setStatus("Enter the decoded checksum.");
      return;
    }

    this.setDisabled(true);

    let nonce = this.powNonce;
    if (!nonce) {
      this.setStatus("Sealing proof-of-work...");
      nonce = await this.powPromise;
    }
    this.setStatus("Checking...");

    let response;
    let result;
    try {
      response = await fetch(this.options.verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        cache: "no-store",
        body: JSON.stringify({ challengeId: this.challenge.id, answer, nonce })
      });
      result = await response.json();
    } catch (error) {
      // Network/parse failure: let the user retry the same challenge rather than
      // silently locking the form.
      qs(this.element, ".clanker-captcha").dataset.state = "error";
      this.setStatus("Verification request failed. Try again.");
      this.setDisabled(false);
      return;
    }

    if (response.ok && result.ok) {
      window.clearInterval(this.timer);
      this.stopGlitchLoop();
      this.stopFrameCycle();
      qs(this.element, ".clanker-captcha").dataset.state = "solved";
      this.setStatus("Verified. Definitely clanking.");
      this.options.onSolved(result.token);
      return;
    }

    qs(this.element, ".clanker-captcha").dataset.state = "error";
    this.setStatus(result.error || "Nope. New spectral field incoming.");
    window.setTimeout(() => this.loadChallenge(), 650);
  }

  setStatus(message) {
    qs(this.element, ".clanker-captcha__status").textContent = message;
  }

  setDisabled(disabled) {
    qs(this.element, ".clanker-captcha__input").disabled = disabled;
    qs(this.element, ".clanker-captcha__button").disabled = disabled;
  }
}
