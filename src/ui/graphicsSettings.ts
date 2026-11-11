import './graphicsSettings.css';
import type * as THREE from 'three';
import type { LightingController } from '../core/lighting.ts';
import { applyGraphicsQuality } from '../core/renderSettings.ts';
import { GRAPHICS_QUALITY_LABELS } from '../state/constantsGraphicsUi.ts';
import {
  parseGraphicsQuality,
  saveGraphicsQuality,
  type GraphicsQuality,
} from '../state/graphicsQuality.ts';
import type { StorageLike } from '../state/save.ts';

export interface GraphicsSettingsOptions {
  renderer: THREE.WebGLRenderer;
  lighting: Pick<LightingController, 'setQuality'>;
  storage: StorageLike | null | undefined;
  initialQuality: GraphicsQuality;
  onQualityChange?: (quality: GraphicsQuality) => void;
}

export interface GraphicsSettingsController {
  getQuality(): GraphicsQuality;
  setQuality(quality: GraphicsQuality): void;
  dispose(): void;
}

// Tạo nút "Đồ họa: Cao / Thấp" trong menu chính & tạm dừng; bấm là áp dụng ngay không cần F5
export function createGraphicsSettingsControl(
  container: HTMLElement,
  options: GraphicsSettingsOptions,
): GraphicsSettingsController {
  let quality = parseGraphicsQuality(options.initialQuality);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'menu-btn-graphics';
  btn.title = 'Chuyển chất lượng đồ họa ngay lập tức';
  btn.setAttribute('data-el', 'graphicsBtn');

  const syncButton = () => {
    btn.textContent = `Đồ họa: ${GRAPHICS_QUALITY_LABELS[quality]}`;
    btn.classList.toggle('is-low', quality === 'low');
  };

  const applyAndSave = (next: GraphicsQuality) => {
    const normalized = parseGraphicsQuality(next);
    quality = normalized;
    applyGraphicsQuality(options.renderer, options.lighting, normalized);
    saveGraphicsQuality(options.storage, normalized);
    syncButton();
    options.onQualityChange?.(normalized);
  };

  const onClick = (event: MouseEvent) => {
    // Ngăn nổi bọt để không tác động tới các handler khóa chuột bên ngoài
    event.stopPropagation();
    applyAndSave(quality === 'high' ? 'low' : 'high');
  };

  btn.addEventListener('click', onClick);
  syncButton();
  container.appendChild(btn);

  return {
    getQuality: () => quality,
    setQuality: applyAndSave,
    dispose() {
      btn.removeEventListener('click', onClick);
      btn.remove();
    },
  };
}
