import './contaminationHud.css';
import { INVENTORY_CONFIG } from '../state/constants.ts';
import { CONTAM_THRESHOLD, SPOIL_THRESHOLD } from '../state/constantsContam.ts';
import { getContaminatedOverThreshold } from '../state/contamination.ts';
import type { InventoryContamination } from '../state/inventory.ts';

export interface ContaminationHudView {
  sync(contamination: InventoryContamination): void;
  hide(): void;
  dispose(): void;
}

// Tạo huy hiệu nhỏ trên HUD khi có nguyên liệu nhiễm vượt ngưỡng
export function createContaminationHud(root: HTMLElement): ContaminationHudView {
  const host = root.querySelector<HTMLElement>('.hud-left-col');
  const el = document.createElement('div');
  el.className = host ? 'contam-badge hidden' : 'contam-badge contam-badge-fixed hidden';
  (host ?? root).appendChild(el);

  return {
    sync(contamination) {
      const over = getContaminatedOverThreshold(contamination, CONTAM_THRESHOLD);
      if (over.length === 0) {
        el.classList.add('hidden');
        return;
      }
      const maxLevel = Math.max(...over.map((e) => e.level));
      const detail =
        over.length <= 2
          ? over.map((e) => `${INVENTORY_CONFIG[e.item].label} ${Math.round(e.level)}%`).join(', ')
          : `${over.length} món (tối đa ${Math.round(maxLevel)}%)`;
      el.textContent = `⚠ Nhiễm nguyên liệu: ${detail}`;
      el.classList.toggle('severe', maxLevel >= SPOIL_THRESHOLD);
      el.classList.remove('hidden');
    },

    hide() {
      el.classList.add('hidden');
    },

    dispose() {
      el.remove();
    },
  };
}
