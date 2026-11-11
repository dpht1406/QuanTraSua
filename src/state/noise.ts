// Bộ sinh số giả ngẫu nhiên có seed (Mulberry32) và nhiễu 2D tuần hoàn thuần TS (GĐ8a)
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2D(ix: number, iy: number, seed: number): number {
  let n =
    Math.imul(ix | 0, 374761393) +
    Math.imul(iy | 0, 668265263) +
    Math.imul(seed | 0, 1442695041);
  n = (n ^ (n >>> 13)) | 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function wrapIndex(i: number, period: number): number {
  const m = i % period;
  return m < 0 ? m + period : m;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Nhiễu 2D nội suy mượt, lặp kín theo chu kỳ (periodX, periodY) trong [0, 1]
export function tileableNoise2D(
  x: number,
  y: number,
  periodX: number,
  periodY: number,
  seed: number,
): number {
  const px = Math.max(1, Math.floor(periodX));
  const py = Math.max(1, Math.floor(periodY));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);

  const ix0 = wrapIndex(x0, px);
  const iy0 = wrapIndex(y0, py);
  const ix1 = wrapIndex(x0 + 1, px);
  const iy1 = wrapIndex(y0 + 1, py);

  const a = hash2D(ix0, iy0, seed);
  const b = hash2D(ix1, iy0, seed);
  const c = hash2D(ix0, iy1, seed);
  const d = hash2D(ix1, iy1, seed);

  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}
