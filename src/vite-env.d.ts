/// <reference types="vite/client" />

declare module 'node:assert/strict' {
  const assert: {
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    throws(fn: () => void, message?: string): void;
  };
  export default assert;
}
