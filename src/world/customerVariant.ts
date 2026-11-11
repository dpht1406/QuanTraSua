import { CAT_VARIANTS } from '../state/catVariants.ts';

// Chọn ngẫu nhiên chỉ số biến thể khách mới và tránh trùng khách liền trước
export function nextCustomerVariantIndex(
  prevIndex: number | null,
  total = CAT_VARIANTS.length,
  rng = Math.random,
): number {
  if (total <= 1) return 0;
  const raw = rng();
  const u = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 0.999999999) : 0;
  if (prevIndex === null || !Number.isInteger(prevIndex) || prevIndex < 0 || prevIndex >= total) {
    return Math.floor(u * total);
  }
  const offset = 1 + Math.floor(u * (total - 1));
  return (prevIndex + offset) % total;
}
