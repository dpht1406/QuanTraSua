import assert from 'node:assert/strict';
import { createSeededRng, hash2D, tileableNoise2D } from './noise.ts';

// Tự kiểm tra bộ sinh số ngẫu nhiên có seed và nhiễu 2D tuần hoàn (thuần TS)
export function runSelfCheck8b(): void {
  const r1 = createSeededRng(104729);
  const r2 = createSeededRng(104729);
  const r3 = createSeededRng(99991);

  const seq1: number[] = [];
  const seq2: number[] = [];
  const seq3: number[] = [];
  for (let i = 0; i < 32; i++) {
    const a = r1();
    const b = r2();
    const c = r3();
    assert.ok(a >= 0 && a < 1, 'RNG out of [0, 1)');
    assert.equal(a, b, 'Cùng seed phải cho dãy số giống hệt nhau');
    seq1.push(a);
    seq2.push(b);
    seq3.push(c);
  }
  assert.ok(
    seq1.some((v, i) => v !== seq3[i]),
    'Seed khác nhau phải cho dãy khác nhau',
  );

  // Kiểm tra hash2D và tileableNoise2D ổn định & lặp khít biên chu kỳ
  assert.equal(hash2D(7, -3, 42), hash2D(7, -3, 42));
  for (let i = 0; i < 16; i++) {
    const u = i * 0.37;
    const v = i * 0.29;
    const n0 = tileableNoise2D(u, v, 4, 8, 123);
    const nWrap = tileableNoise2D(u + 4, v + 8, 4, 8, 123);
    assert.ok(n0 >= 0 && n0 <= 1);
    assert.ok(Math.abs(n0 - nWrap) < 1e-12, 'tileableNoise2D phải khớp khi cộng đúng chu kỳ');
  }
}
