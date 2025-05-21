import { describe, it, expect } from 'vitest';

describe('simple test suite', () => {
  it('should pass', () => {
    expect(true).toBe(true);
  });

  it('should also pass', () => {
    expect(1 + 1).toBe(2);
  });
});
