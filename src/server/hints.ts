/**
 * AI のヒント生成。Workers AI の Qwen 3.8 27B を使い、無料枠を超えたら Qwen の公式 API に切り替える。
 *
 * 出典と確度（2026-10-17 に確認）:
 * - Workers AI: https://developers.cloudflare.com/workers-ai/models/qwen3.8-27b/
 *   モデル ID `@cf/qwen/qwen3.8-27b`、reasoning_effort は low / medium / xhigh。
 *   JSON モードは https://developers.cloudflare.com/workers-ai/features/json-mode/ の形
 *   （response_format.json_schema に素のスキーマ、応答は { response: {...} }）。
 *   画像部分の形と、無料枠超過のエラーの形はドキュメントに無く未確認。
 *   そのため isQuotaError は HTTP 429 と、メッセージの "neurons" / "4006" / "daily free allocation" で判定する。
 * - Qwen 公式 API: モデル ID `qwen3.8-27b`（https://help.aliyun.com/en/model-studio/qwen3-8-27b ）。
 *   OpenAI 互換（https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions ）で、
 *   画像は image_url の data URL、構造化出力は response_format.json_schema{name,strict,schema}、
 *   reasoning_effort は low / medium / xhigh。シンガポールの base URL は
 *   https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1（旧 dashscope-intl も可）。
 * - TODO(未確認): ai.provider('qwen') が AI Gateway 経由でこの base URL に届くか。
 *   届かない場合は QWEN_BASE_URL を直接 fetch する形に変える（呼び出し側は変わらない）。
 */
import { LOCALE_NAMES } from '../shared/locales';
import type { Locale } from '../shared/locales';

export const HINT_MODEL = '@cf/qwen/qwen3.8-27b';
/** TODO(未確認): 公式 API 上の表記。help.aliyun.com の製品ページでは `qwen3.8-27b`。 */
export const QWEN_MODEL = 'qwen3.8-27b';

export const HINT_SCHEMA = {
  type: 'object',
  properties: { hints: { type: 'array', items: { type: 'string' }, minItems: 5, maxItems: 5 } },
  required: ['hints'],
} as const;

export const LOCALE_ENGLISH_NAMES: Record<Locale, string> = {
  ja: 'Japanese',
  en: 'English',
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ko: 'Korean',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  'pt-BR': 'Brazilian Portuguese',
  id: 'Indonesian',
  vi: 'Vietnamese',
};

export function buildHintPrompt(locale: Locale): string {
  const language = LOCALE_ENGLISH_NAMES[locale] ?? LOCALE_NAMES[locale];
  return [
    'You are the host of a photo-hunting game. Players will try to take a photo that matches the attached photo.',
    `Write exactly 5 hints about the scene in the photo. Write them in ${language}.`,
    'Hint 1 must be the vaguest, such as the general mood, colors or kind of object.',
    'Each following hint must be more specific than the previous one, and hint 5 must be the most concrete, describing what is in the frame and how it is arranged.',
    'Do not name the specific place where the photo was taken (a proper noun such as a shop, building or town) in hints 1 to 4. You may do so only in hint 5.',
    'Each hint is one short sentence. Do not number the hints.',
    'Respond only with JSON of the form {"hints": ["...", "...", "...", "...", "..."]}.',
  ].join('\n');
}

export function isQuotaError(e: unknown): boolean {
  if (typeof e === 'object' && e !== null) {
    const o = e as { status?: unknown; statusCode?: unknown };
    if (o.status === 429 || o.statusCode === 429) return true;
  }
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /neurons|\b4006\b|daily free allocation/i.test(msg);
}

export class HintGenerationError extends Error {}

export interface HintDeps {
  ai: { run(model: string, input: unknown): Promise<unknown> };
  qwen: (body: unknown) => Promise<unknown>;
  maxAttempts?: number;
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function messages(image: Uint8Array, locale: Locale) {
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: buildHintPrompt(locale) },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${toBase64(image)}` } },
      ],
    },
  ];
}

/** Workers AI の応答（{ response } か chat completion）と Qwen の応答から、ヒントの配列を取り出す。 */
function extractHints(result: unknown): string[] {
  const r = result as {
    response?: unknown;
    choices?: { message?: { content?: unknown } }[];
  } | null;
  let v: unknown = r?.response ?? r?.choices?.[0]?.message?.content;
  if (typeof v === 'string') v = JSON.parse(v);
  const hints = (v as { hints?: unknown } | null)?.hints;
  if (
    !Array.isArray(hints) ||
    hints.length !== 5 ||
    !hints.every((h) => typeof h === 'string' && h.trim() !== '')
  ) {
    throw new Error('hints must be 5 non-empty strings');
  }
  return hints.map((h: string) => h.trim());
}

export async function generateHints(
  d: HintDeps,
  image: Uint8Array,
  locale: Locale,
): Promise<string[]> {
  const attempts = d.maxAttempts ?? 3;
  let useQwen = false;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const msgs = messages(image, locale);
      const result = useQwen
        ? await d.qwen({
            model: QWEN_MODEL,
            messages: msgs,
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'hints', strict: true, schema: HINT_SCHEMA },
            },
            reasoning_effort: 'low',
          })
        : await d.ai.run(HINT_MODEL, {
            messages: msgs,
            response_format: { type: 'json_schema', json_schema: HINT_SCHEMA },
            reasoning_effort: 'low',
          });
      return extractHints(result);
    } catch (e) {
      last = e;
      if (!useQwen && isQuotaError(e)) useQwen = true;
    }
  }
  throw new HintGenerationError('hint generation failed', { cause: last });
}
