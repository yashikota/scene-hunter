import { describe, expect, it } from 'vite-plus/test';
import { buildHintPrompt, generateHints, isQuotaError } from '../../src/server/hints';

const five = ['a', 'b', 'c', 'd', 'e'];
const ok = { response: { hints: five } };
const img = new Uint8Array([1, 2, 3]);

function fakes(aiResults: (unknown | Error)[], qwenResults: (unknown | Error)[] = []) {
  const calls = { ai: 0, qwen: 0 };
  const next = (list: (unknown | Error)[], k: 'ai' | 'qwen') => async () => {
    const r = list[calls[k]++];
    if (r instanceof Error) throw r;
    return r;
  };
  return {
    calls,
    d: {
      ai: { run: next(aiResults, 'ai') },
      qwen: next(qwenResults, 'qwen'),
    },
  };
}

describe('generateHints', () => {
  it('returns 5 hints', async () => {
    const { d } = fakes([ok]);
    expect(await generateHints(d, img, 'ja')).toEqual(five);
  });

  it('accepts a chat-completion shaped result with JSON text', async () => {
    const { d } = fakes([{ choices: [{ message: { content: JSON.stringify({ hints: five }) } }] }]);
    expect(await generateHints(d, img, 'en')).toEqual(five);
  });

  it('retries when the first result has 4 hints', async () => {
    const { d, calls } = fakes([{ response: { hints: five.slice(0, 4) } }, ok]);
    expect(await generateHints(d, img, 'ja')).toEqual(five);
    expect(calls.ai).toBe(2);
  });

  it('retries on empty strings', async () => {
    const { d, calls } = fakes([{ response: { hints: ['a', '', 'c', 'd', 'e'] } }, ok]);
    await generateHints(d, img, 'ja');
    expect(calls.ai).toBe(2);
  });

  it('switches to qwen after a quota error and never calls ai again', async () => {
    const { d, calls } = fakes(
      [new Error('4006: you have used up your daily free allocation of 10,000 neurons')],
      [{ choices: [{ message: { content: JSON.stringify({ hints: five }) } }] }],
    );
    expect(await generateHints(d, img, 'ja')).toEqual(five);
    expect(calls).toEqual({ ai: 1, qwen: 1 });
  });

  it('throws when every attempt fails', async () => {
    const { d, calls } = fakes([new Error('x'), { response: {} }, 'oops']);
    await expect(generateHints(d, img, 'ja')).rejects.toThrow(Error);
    expect(calls.ai).toBe(3);
  });
});

describe('isQuotaError', () => {
  it('detects 429 and known messages', () => {
    expect(isQuotaError({ status: 429 })).toBe(true);
    expect(isQuotaError(new Error('exceeded neurons'))).toBe(true);
    expect(isQuotaError(new Error('network down'))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });
});

describe('buildHintPrompt', () => {
  it('names the language in English', () => {
    expect(buildHintPrompt('ko')).toContain('Korean');
    expect(buildHintPrompt('ja')).toContain('Japanese');
  });
});
