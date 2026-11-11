export interface InputState {
  isDown(code: string): boolean;
  onInteract(cb: () => void): () => void;
  clear(): void;
  dispose(): void;
}

// Quản lý bàn phím WASD/Shift và phím tương tác E
export function createInput(): InputState {
  const pressed = new Set<string>();
  const interactListeners = new Set<() => void>();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    pressed.add(event.code);
    if (event.code === 'KeyE') {
      for (const cb of interactListeners) cb();
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    pressed.delete(event.code);
  };

  const clear = () => {
    pressed.clear();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', clear);

  return {
    isDown(code) {
      return pressed.has(code);
    },
    onInteract(cb) {
      interactListeners.add(cb);
      return () => interactListeners.delete(cb);
    },
    clear,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
    },
  };
}
