import type { HTMLAttributes } from 'react';

/** 1 画面の外枠。スマートフォンの幅に合わせ、広い画面では中央に寄せる。 */
export function Screen({
  variant = 'room',
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { variant?: 'top' | 'room' }) {
  return <main className={`sh-screen ${variant === 'top' ? 'sh-screen--top' : ''} ${className ?? ''}`} {...rest} />;
}
