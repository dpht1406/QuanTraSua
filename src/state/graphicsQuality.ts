import { DEFAULT_GRAPHICS_QUALITY, GRAPHICS_STORAGE_KEY } from './constantsGraphics.ts';
import type { StorageLike } from './save.ts';

export type GraphicsQuality = 'low' | 'high';

// Chuẩn hóa giá trị đọc từ storage/UI; giá trị lạ mặc định về 'high'
export function parseGraphicsQuality(raw: unknown): GraphicsQuality {
  return raw === 'low' ? 'low' : DEFAULT_GRAPHICS_QUALITY;
}

// Đọc mức chất lượng đồ họa từ storage riêng, lỗi storage -> trả mặc định 'high'
export function loadGraphicsQuality(storage: StorageLike | null | undefined): GraphicsQuality {
  if (!storage) return DEFAULT_GRAPHICS_QUALITY;
  try {
    return parseGraphicsQuality(storage.getItem(GRAPHICS_STORAGE_KEY));
  } catch {
    return DEFAULT_GRAPHICS_QUALITY;
  }
}

// Lưu mức chất lượng đồ họa vào storage riêng (không chạm save game)
export function saveGraphicsQuality(
  storage: StorageLike | null | undefined,
  q: GraphicsQuality,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(GRAPHICS_STORAGE_KEY, parseGraphicsQuality(q));
    return true;
  } catch {
    return false;
  }
}
