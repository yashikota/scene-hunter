import type { ReactNode } from 'react';
import { m } from '../paraglide/messages';
import { Card } from '../ui/Card';

/** 写真の枠（4:3 の代わりに高さを決めた正方形に近い枠）。写真が無いときは代わりの文を出す。 */
export function Thumb({ url, alt, height, dim = false }: { url?: string; alt: string; height: number; dim?: boolean }) {
  return (
    <div
      style={{
        height,
        width: '100%',
        background: 'var(--color-bg)',
        border: 'var(--border)',
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dim ? 0.4 : 1,
      }}
    >
      {url && <img src={url} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
    </div>
  );
}

/** お題の写真と一言。 */
export function TopicCard({ url, note }: { url?: string; note?: ReactNode }) {
  return (
    <Card raised style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr)', gap: 12, alignItems: 'center', padding: 10 }}>
      <Thumb url={url} alt={m.topic_photo()} height={150} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="sh-display" style={{ fontSize: 16 }}>
          {m.topic_label()}
        </span>
        {note && (
          <span className="sh-sub" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {note}
          </span>
        )}
      </div>
    </Card>
  );
}

/** 写真が来るまでの待ちの表示。 */
export function Collecting({ text }: { text: string }) {
  return (
    <div role="status" className="sh-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>
      <span className="sh-pulse" aria-hidden="true" style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--color-timer)', border: 'var(--border)' }} />
      {text}
    </div>
  );
}
