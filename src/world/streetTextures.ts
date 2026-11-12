import { createSeededRng, tileableNoise2D } from '../state/noise.ts';

// Vẽ texture mặt đường nhựa tối ấm có hạt đá nhỏ liền mạch (tileable)
export function paintAsphalt(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = createSeededRng(8505);
  const img = ctx.createImageData(size, size);
  const data = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const coarse = tileableNoise2D(x / 24, y / 24, size / 24, size / 24, 41);
      const fine = tileableNoise2D(x / 4, y / 4, size / 4, size / 4, 97);
      const grit = (rng() - 0.5) * 14;
      const lum = Math.min(106, Math.max(58, Math.round(76 + coarse * 10 + fine * 9 + grit)));
      const idx = (y * size + x) * 4;
      data[idx] = lum;
      data[idx + 1] = lum + 1;
      data[idx + 2] = lum + 5;
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Vẽ texture gạch lát vỉa hè ấm áp có ron gạch và viền sáng nhẹ
export function paintSidewalk(ctx: CanvasRenderingContext2D, size: number): void {
  const rng = createSeededRng(8606);
  const grid = 4;
  const cell = size / grid;
  const grout = 3;

  ctx.fillStyle = '#bfb4a7';
  ctx.fillRect(0, 0, size, size);

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = gx * cell + grout * 0.5;
      const y = gy * cell + grout * 0.5;
      const w = cell - grout;
      const base = 216 + Math.floor(rng() * 14);
      ctx.fillStyle = `rgb(${base}, ${base - 7}, ${base - 15})`;
      ctx.fillRect(x, y, w, w);

      ctx.fillStyle = 'rgba(255, 250, 244, 0.42)';
      ctx.fillRect(x, y, w, 1.5);
      ctx.fillRect(x, y, 1.5, w);

      ctx.fillStyle = 'rgba(150, 136, 122, 0.28)';
      ctx.fillRect(x, y + w - 1.5, w, 1.5);
      ctx.fillRect(x + w - 1.5, y, 1.5, w);

      for (let i = 0; i < 28; i++) {
        const px = x + 2 + rng() * (w - 4);
        const py = y + 2 + rng() * (w - 4);
        ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(130,115,100,0.07)';
        ctx.fillRect(px, py, 2, 2);
      }
    }
  }
}

// Vẽ texture mặt tiền dãy nhà đối diện / hai bên (cửa sổ, khung, mái hiên tầng trệt)
export function paintFacade(ctx: CanvasRenderingContext2D, size: number, variant: 0 | 1 | 2): void {
  const rng = createSeededRng(8700 + variant * 31);
  ctx.fillStyle = '#f5efe6';
  ctx.fillRect(0, 0, size, size);

  // Nhiễu vữa tường nhẹ để đồng bộ tông vật liệu quán
  for (let i = 0; i < 650; i++) {
    const px = rng() * size;
    const py = rng() * size;
    ctx.fillStyle = rng() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(168,148,128,0.08)';
    ctx.fillRect(px, py, 3, 2);
  }

  // Viền phân tầng và chân tường tầng trệt
  ctx.fillStyle = '#e5dacb';
  ctx.fillRect(0, size * 0.64, size, size * 0.36);
  ctx.fillStyle = '#cbbba8';
  ctx.fillRect(0, size * 0.63, size, 4);
  ctx.fillRect(0, 0, size, 8);

  const cols = variant === 1 ? 2 : 3;
  const rows = 2;
  const padX = size * 0.1;
  const colW = (size - padX * 2) / cols;

  // Cửa sổ các tầng trên
  for (let r = 0; r < rows; r++) {
    const wy = size * (0.1 + r * 0.26);
    const wh = size * 0.17;
    for (let c = 0; c < cols; c++) {
      const ww = colW * (variant === 1 ? 0.64 : 0.56);
      const wx = padX + c * colW + (colW - ww) * 0.5;
      ctx.fillStyle = '#d8cab9';
      ctx.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      ctx.fillStyle = variant === 2 ? '#5a788d' : '#6f8ea4';
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = 'rgba(255, 248, 232, 0.25)';
      ctx.fillRect(wx + 3, wy + 3, ww * 0.36, wh - 6);
      ctx.fillStyle = '#f3eadf';
      ctx.fillRect(wx + ww * 0.5 - 1.5, wy, 3, wh);
      ctx.fillRect(wx - 6, wy + wh + 2, ww + 12, 4);
    }
  }

  // Mặt tiền cửa hàng tầng trệt: khung kính lớn + cửa ra vào
  const doorW = size * 0.2;
  const doorX = variant === 0 ? size * 0.14 : size * 0.4;
  ctx.fillStyle = '#7b5842';
  ctx.fillRect(doorX - 3, size * 0.72, doorW + 6, size * 0.28);
  ctx.fillStyle = '#89abc0';
  ctx.fillRect(doorX + 2, size * 0.75, doorW - 4, size * 0.21);

  const shopWinX = variant === 0 ? size * 0.42 : size * 0.1;
  const shopWinW = variant === 0 ? size * 0.46 : size * 0.24;
  ctx.fillStyle = '#7b5842';
  ctx.fillRect(shopWinX - 3, size * 0.73, shopWinW + 6, size * 0.19);
  ctx.fillStyle = '#9ec1d6';
  ctx.fillRect(shopWinX, size * 0.75, shopWinW, size * 0.15);

  if (variant !== 0) {
    ctx.fillStyle = '#7b5842';
    ctx.fillRect(size * 0.66 - 3, size * 0.73, size * 0.24 + 6, size * 0.19);
    ctx.fillStyle = '#9ec1d6';
    ctx.fillRect(size * 0.66, size * 0.75, size * 0.24, size * 0.15);
  }
}

// Vẽ texture biển treo cửa "MỞ CỬA" / "ĐÓNG CỬA" (nén trục X nhẹ để khớp bảng 3:1)
export function paintShopSign(ctx: CanvasRenderingContext2D, size: number, open: boolean): void {
  ctx.fillStyle = open ? '#d9f0dc' : '#fad7de';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = open ? '#5b8a63' : '#b25b6b';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 14, size - 16, size - 28);

  ctx.save();
  ctx.translate(size * 0.5, size * 0.5);
  ctx.scale(0.38, 1);
  ctx.fillStyle = open ? '#2e5936' : '#7b2d3c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 72px sans-serif';
  ctx.fillText(open ? 'MỞ CỬA' : 'ĐÓNG CỬA', 0, -size * 0.08);

  ctx.font = '700 38px sans-serif';
  ctx.fillStyle = open ? '#497951' : '#964756';
  ctx.fillText(open ? 'OPEN' : 'CLOSED', 0, size * 0.23);
  ctx.restore();
}
