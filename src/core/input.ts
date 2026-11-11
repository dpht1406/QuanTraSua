export interface InputState {
  isDown(code: string): boolean;
  onInteract(cb: () => void): () => void;
  onDigit(cb: (digit: 1 | 2 | 3) => void): () => void;
  onKey(code: string, cb: () => void): () => void;
  clear(): void;
  dispose(): void;
}

// Quản lý bàn phím WASD/Shift, phím E, chọn 1/2/3 và phím tắt Y/N/Esc
export function createInput(): InputState {
  const pressed = new Set<string>();
  const interactListeners = new Set<() => void>();
  const digitListeners = new Set<(digit: 1 | 2 | 3) => void>();
  const keyListeners = new Map<string, Set<() => void>>();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.repeat) return;
    pressed.add(event.code);
    if (event.code === 'KeyE') {
      for (const cb of interactListeners) cb();
    } else if (event.code === 'Digit1' || event.code === 'Numpad1') {
      for (const cb of digitListeners) cb(1);
    } else if (event.code === 'Digit2' || event.code === 'Numpad2') {
      for (const cb of digitListeners) cb(2);
    } else if (event.code === 'Digit3' || event.code === 'Numpad3') {
      for (const cb of digitListeners) cb(3);
    }
    const listeners = keyListeners.get(event.code);
    if (listeners) {
      for (const cb of listeners) cb();
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
    onDigit(cb) {
      digitListeners.add(cb);
      return () => digitListeners.delete(cb);
    },
    onKey(code, cb) {
      let set = keyListeners.get(code);
      if (!set) {
        set = new Set();
        keyListeners.set(code, set);
      }
      set.add(cb);
      return () => set?.delete(cb);
    },
    clear,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clear);
    },
  };
}
