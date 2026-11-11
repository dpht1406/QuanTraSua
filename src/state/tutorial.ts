import type { EventBus } from './eventBus.ts';
import type { GameEvents } from './gameState.ts';

export type TutorialStepId =
  | 'open_shift'
  | 'serve_order'
  | 'clean_stain'
  | 'close_shift'
  | 'hire_staff';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  instruction: string;
  optional: boolean;
}

export interface TutorialViewState {
  step: TutorialStep;
  stepNumber: number;
  totalSteps: number;
  skipKeyLabel: string;
}

export const TUTORIAL_SKIP_KEY = 'KeyH';
export const TUTORIAL_SKIP_KEY_LABEL = 'H';

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'open_shift',
    title: 'Mở ca bán hàng',
    instruction: 'Đi tới cửa ra vào và nhấn E để mở ca đón khách.',
    optional: false,
  },
  {
    id: 'serve_order',
    title: 'Pha và giao một ly',
    instruction:
      'Nhấn G chào khách, nhấn E chọn món 1/2/3 ở quầy pha chế, ép nắp rồi nhấn E giao ở quầy.',
    optional: false,
  },
  {
    id: 'clean_stain',
    title: 'Dọn một vết bẩn',
    instruction: 'Nhấn E lấy chổi/cây lau ở giá tường, rồi giữ chuột vào vết bẩn hoặc bàn bẩn để dọn.',
    optional: false,
  },
  {
    id: 'close_shift',
    title: 'Kết ca và xem tổng kết',
    instruction: 'Chờ đến 22:00 hoặc ra cửa nhấn E rồi bấm Y/N (chọn Y) để kết ca và xem tổng kết.',
    optional: false,
  },
  {
    id: 'hire_staff',
    title: 'Thuê nhân viên (Tùy chọn)',
    instruction: 'Khi quán đóng cửa, tới Bảng nhân viên nhấn E để thuê thêm người hỗ trợ.',
    optional: true,
  },
];

// Quản lý luồng hướng dẫn 5 bước chạy theo EventBus, không chặn luật chơi
export function createTutorialController(
  bus: EventBus<GameEvents>,
  options: {
    initialDone?: boolean;
    onChange?: (view: TutorialViewState | null) => void;
    onDone?: (skipped: boolean) => void;
  } = {},
) {
  let done = Boolean(options.initialDone);
  let stepIndex = done ? TUTORIAL_STEPS.length : 0;
  let unsubs: Array<() => void> = [];

  const cleanup = () => {
    for (const unsub of unsubs) unsub();
    unsubs = [];
  };

  const getView = (): TutorialViewState | null => {
    if (done) return null;
    const step = TUTORIAL_STEPS[stepIndex];
    if (!step) return null;
    return {
      step,
      stepNumber: stepIndex + 1,
      totalSteps: TUTORIAL_STEPS.length,
      skipKeyLabel: TUTORIAL_SKIP_KEY_LABEL,
    };
  };

  const advanceIfAt = (expectedId: TutorialStepId) => {
    if (done || TUTORIAL_STEPS[stepIndex]?.id !== expectedId) return;
    stepIndex += 1;
    if (stepIndex >= TUTORIAL_STEPS.length) {
      done = true;
      cleanup();
      options.onChange?.(null);
      options.onDone?.(false);
      return;
    }
    options.onChange?.(getView());
  };

  if (!done) {
    unsubs = [
      bus.on('shiftOpened', () => advanceIfAt('open_shift')),
      bus.on('orderServed', () => advanceIfAt('serve_order')),
      bus.on('cleanlinessChanged', ({ delta }) => {
        if (delta > 0) advanceIfAt('clean_stain');
      }),
      bus.on('shiftClosed', () => advanceIfAt('close_shift')),
      bus.on('staffHired', () => advanceIfAt('hire_staff')),
    ];
  }

  return {
    isDone(): boolean {
      return done;
    },

    isActive(): boolean {
      return !done;
    },

    getStepIndex(): number {
      return stepIndex;
    },

    getCurrentStep(): TutorialStep | null {
      return done ? null : (TUTORIAL_STEPS[stepIndex] ?? null);
    },

    getView,

    skip(): void {
      if (done) return;
      done = true;
      stepIndex = TUTORIAL_STEPS.length;
      cleanup();
      options.onChange?.(null);
      options.onDone?.(true);
    },

    dispose: cleanup,
  };
}

export type TutorialController = ReturnType<typeof createTutorialController>;
