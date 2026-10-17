import { describe, expect, it } from 'vite-plus/test';
import {
  buildHintPrompt,
  generateHints,
  HINT_MODEL,
  HINT_SCHEMA,
  HintGenerationError,
  isQuotaError,
  QWEN_MODEL,
} from '../../src/server/hints';

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
    await expect(generateHints(d, img, 'ja')).rejects.toThrow(HintGenerationError);
    expect(calls.ai).toBe(3);
  });
});

describe('AI への呼び出しは同時に 1 本', () => {
  it('前の呼び出しが終わるまで次を出さない', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const results: unknown[] = [{ response: {} }, new Error('x'), ok];
    const d = {
      ai: {
        run: async () => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 5));
          inFlight--;
          const r = results.shift();
          if (r instanceof Error) throw r;
          return r;
        },
      },
      qwen: async () => ok,
    };
    expect(await generateHints(d, img, 'ja')).toEqual(five);
    expect(maxInFlight).toBe(1);
  });
});

describe('isQuotaError', () => {
  it('detects 429 and known messages', () => {
    expect(isQuotaError({ status: 429 })).toBe(true);
    expect(isQuotaError(new Error('exceeded neurons'))).toBe(true);
    expect(isQuotaError(new Error('network down'))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
    expect(isQuotaError(new Error('took 14006 ms'))).toBe(false);
    expect(isQuotaError(new Error('error 4006'))).toBe(true);
  });
});

describe('buildHintPrompt', () => {
  it('names the language in English', () => {
    expect(buildHintPrompt('ko')).toContain('Korean');
    expect(buildHintPrompt('ja')).toContain('Japanese');
  });
});

describe('request bodies', () => {
  const dataUrl = 'data:image/jpeg;base64,AQID';

  it('sends the Workers AI input', async () => {
    let got: any;
    const d = {
      ai: { run: async (m: string, i: unknown) => ((got = { m, i }), ok) },
      qwen: async () => ok,
    };
    await generateHints(d, img, 'ko');
    expect(got.m).toBe(HINT_MODEL);
    // 思考を止める（推論トークンを出さない）。reasoning_effort は送らない
    expect(got.i.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(got.i).not.toHaveProperty('reasoning_effort');
    expect(got.i.response_format).toEqual({ type: 'json_schema', json_schema: HINT_SCHEMA });
    expect(got.i.messages[0].content).toEqual([
      { type: 'text', text: buildHintPrompt('ko') },
      { type: 'image_url', image_url: { url: dataUrl } },
    ]);
  });

  it('sends the Qwen API body', async () => {
    let got: any;
    const d = {
      ai: {
        run: async () => {
          throw Object.assign(new Error('x'), { status: 429 });
        },
      },
      qwen: async (b: unknown) => ((got = b), ok),
    };
    await generateHints(d, img, 'ko');
    expect(got.model).toBe(QWEN_MODEL);
    expect(got.enable_thinking).toBe(false);
    expect(got).not.toHaveProperty('reasoning_effort');
    expect(got.response_format).toEqual({
      type: 'json_schema',
      json_schema: { name: 'hints', strict: true, schema: HINT_SCHEMA },
    });
    expect(got.messages[0].content).toEqual([
      { type: 'text', text: buildHintPrompt('ko') },
      { type: 'image_url', image_url: { url: dataUrl } },
    ]);
  });
});
