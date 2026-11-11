import * as THREE from 'three';
import { createSeededRng, tileableNoise2D } from '../state/noise.ts';

type TextureKey = 'woodFloor' | 'tile' | 'wall' | 'woodTable';

const TEXTURE_ANISOTROPY = 4;
const textureCache = new Map<TextureKey, THREE.CanvasTexture>();

function createCanvasTexture(
  size: number,
  repeatX: number,
  repeatY: number,
  paint: (ctx: CanvasRenderingContext2D, size: number) => void,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  paint(ctx, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = TEXTURE_ANISOTROPY;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function getOrCreate(key: TextureKey, build: () => THREE.CanvasTexture | null): THREE.CanvasTexture | null {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const tex = build();
  if (tex) textureCache.set(key, tex);
  return tex;
}

function paintWoodFloor(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = createSeededRng(8101);
  const rows = 10;
  ctx.fillStyle = '#f5efe6';
  ctx.fillRect(0, 0, size, size);

  for (let r = 0; r < rows; r++) {
    const y0 = Math.round((r * size) / rows);
    const y1 = Math.round(((r + 1) * size) / rows);
    const h = y1 - y0;
    const joint = Math.round((((r % 2) * 0.5 + 0.12 + rng() * 0.24) % 1) * size);
    const segments: Array<[number, number]> = [
      [0, joint],
      [joint, size - joint],
    ];

    segments.forEach(([sx, sw], idx) => {
      if (sw <= 0) return;
      const base = 237 + Math.floor(rng() * 17);
      const warm = Math.floor(rng() * 5);
      ctx.fillStyle = `rgb(${base}, ${base - 3 - warm}, ${base - 9 - warm})`;
      ctx.fillRect(sx, y0, sw, h);

      // Vân gỗ mảnh chạy dọc tấm ván
      const streaks = 8 + Math.floor(rng() * 5);
      for (let s = 0; s < streaks; s++) {
        const sy = y0 + 4 + rng() * Math.max(4, h - 8);
        const alpha = 0.05 + rng() * 0.08;
        ctx.strokeStyle = s % 3 === 0
          ? `rgba(255, 252, 245, ${alpha + 0.04})`
          : `rgba(170, 140, 112, ${alpha})`;
        ctx.lineWidth = 1 + rng() * 1.1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        const wave = (rng() - 0.5) * 4;
        ctx.quadraticCurveTo(sx + sw * 0.5, sy + wave, sx + sw, sy + (rng() - 0.5) * 2);
        ctx.stroke();
      }

      if (idx > 0) {
        ctx.fillStyle = 'rgba(155, 128, 102, 0.55)';
        ctx.fillRect(sx - 1, y0, 2, h);
        ctx.fillStyle = 'rgba(255, 252, 246, 0.35)';
        ctx.fillRect(sx + 1, y0, 1, h);
      }
    });

    // Khe ván ngang và viền sáng nhẹ tạo độ nổi mềm
    ctx.fillStyle = 'rgba(155, 128, 102, 0.55)';
    ctx.fillRect(0, y0, size, 2);
    ctx.fillStyle = 'rgba(255, 252, 246, 0.38)';
    ctx.fillRect(0, y0 + 2, size, 1);
  }
}

function paintTiles(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = createSeededRng(8202);
  const grid = 4;
  const cell = size / grid;
  const grout = 3;

  ctx.fillStyle = '#dad0c5';
  ctx.fillRect(0, 0, size, size);

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = gx * cell + grout * 0.5;
      const y = gy * cell + grout * 0.5;
      const w = cell - grout;
      const v = 242 + Math.floor(rng() * 12);
      ctx.fillStyle = `rgb(${v}, ${v - 2}, ${v - 5})`;
      ctx.fillRect(x, y, w, w);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fillRect(x, y, w, 1.5);
      ctx.fillRect(x, y, 1.5, w);

      ctx.fillStyle = 'rgba(182, 168, 152, 0.25)';
      ctx.fillRect(x, y + w - 1.5, w, 1.5);
      ctx.fillRect(x + w - 1.5, y, 1.5, w);

      for (let i = 0; i < 42; i++) {
        const px = x + 2 + rng() * (w - 4);
        const py = y + 2 + rng() * (w - 4);
        ctx.fillStyle = rng() > 0.5
          ? `rgba(255, 255, 255, ${0.04 + rng() * 0.05})`
          : `rgba(175, 160, 145, ${0.03 + rng() * 0.05})`;
        ctx.fillRect(px, py, 1.5, 1.5);
      }
    }
  }
}

function paintWallPlaster(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = createSeededRng(8303);
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const coarse = tileableNoise2D(x / 32, y / 32, size / 32, size / 32, 31);
      const fine = tileableNoise2D(x / 8, y / 8, size / 8, size / 8, 79);
      const jitter = (rng() - 0.5) * 3;
      const lum = Math.min(255, Math.max(242, Math.round(244 + coarse * 6 + fine * 4 + jitter)));
      const idx = (y * size + x) * 4;
      data[idx] = lum;
      data[idx + 1] = lum - 1;
      data[idx + 2] = lum - 2;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function paintWoodTable(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = createSeededRng(8404);
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = tileableNoise2D(x / 64, y / 32, size / 64, size / 32, 113);
      const fiber = tileableNoise2D(x / 8, y / 64, size / 8, size / 64, 211);
      const ring = Math.sin((y / size) * Math.PI * 10 + warp * 4.2) * 0.5 + 0.5;
      const tone = ring * 0.55 + fiber * 0.35 + (rng() - 0.5) * 0.08;
      const lum = Math.min(255, Math.max(216, Math.round(220 + tone * 34)));
      const idx = (y * size + x) * 4;
      data[idx] = lum;
      data[idx + 1] = Math.max(0, lum - 5);
      data[idx + 2] = Math.max(0, lum - 12);
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Lấy hoặc sinh texture sàn gỗ tấm ván có vân & khe (null trên Node)
export function getWoodFloorTexture(): THREE.CanvasTexture | null {
  return getOrCreate('woodFloor', () => createCanvasTexture(512, 3, 4, paintWoodFloor));
}

// Lấy hoặc sinh texture gạch lát nền khu quầy (null trên Node)
export function getTileTexture(): THREE.CanvasTexture | null {
  return getOrCreate('tile', () => createCanvasTexture(256, 4, 2.3, paintTiles));
}

// Lấy hoặc sinh texture tường sơn có nhiễu mịn nhẹ (null trên Node)
export function getWallTexture(): THREE.CanvasTexture | null {
  return getOrCreate('wall', () => createCanvasTexture(256, 3, 2, paintWallPlaster));
}

// Lấy hoặc sinh texture mặt bàn vân gỗ ấm (null trên Node)
export function getWoodTableTexture(): THREE.CanvasTexture | null {
  return getOrCreate('woodTable', () => createCanvasTexture(256, 1, 1, paintWoodTable));
}

// Giải phóng toàn bộ texture đã cache khi hủy cảnh
export function disposeTextures(): void {
  for (const tex of textureCache.values()) {
    tex.dispose();
  }
  textureCache.clear();
}
