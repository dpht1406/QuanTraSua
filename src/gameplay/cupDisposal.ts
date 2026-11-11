import type { CleanlinessStore } from '../state/cleanliness.ts';
import type { Cup } from '../state/scoring.ts';

export interface CupDisposalDeps {
  cleanliness: CleanlinessStore;
  onTrashChanged: () => void;
  notify: (message: string) => void;
}

export interface DiscardCupResult {
  ok: boolean;
  becameFull: boolean;
  spilled: boolean;
}

let activeDeps: CupDisposalDeps | null = null;

// Gắn phụ thuộc cho bỏ ly vào thùng rác
export function initCupDisposal(deps: CupDisposalDeps): void {
  activeDeps = deps;
}

// Bỏ một ly bất kỳ vào thùng rác (mất nguyên liệu đã dùng, đếm đầy, sinh vết đổ như hiện tại)
export function discardCupInBin(
  _cup: Cup,
  deps: CupDisposalDeps | null = activeDeps,
): DiscardCupResult {
  if (!deps) return { ok: false, becameFull: false, spilled: false };
  const res = deps.cleanliness.recordTrashCup();
  deps.onTrashChanged();
  if (res.becameFull) deps.notify('Thùng rác đã đầy! Nhấn E để đổ rác.');
  else if (res.spilled) deps.notify('Ối, làm đổ vết bẩn cạnh thùng rác!');
  else deps.notify('Đã bỏ ly vào thùng rác!');
  return { ok: true, ...res };
}
