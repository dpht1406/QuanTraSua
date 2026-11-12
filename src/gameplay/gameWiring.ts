import { initContaminationModule } from './contaminationModule.ts';
import type { GameCtx, Phase6Module } from './gameCtx.ts';
import { initHandsModule } from './handsModule.ts';
import { initThrowModule } from './throwModule.ts';
import { initToolsModule } from './toolsModule.ts';

// Khởi tạo tuần tự các module GĐ6, gắn vào vòng lặp và tự reset khi kết ca hoặc sau khi tải save
export function initPhase6Modules(ctx: GameCtx): Phase6Module {
  const modules: Phase6Module[] = [
    initHandsModule(ctx),
    initToolsModule(ctx),
    initThrowModule(ctx),
    initContaminationModule(ctx),
  ];

  const update = (dt: number) => {
    for (const mod of modules) mod.update(dt);
  };

  const reset = () => {
    for (const mod of modules) mod.reset();
    ctx.furnitureBodies.reset();
  };

  ctx.registerTick(update);
  ctx.eventBus.on('shiftClosed', reset);
  if (ctx.loadedSave) reset();

  return { update, reset };
}
