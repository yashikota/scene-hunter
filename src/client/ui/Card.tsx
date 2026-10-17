import type { HTMLAttributes } from 'react';

/** 白い面に太い輪郭。raised で影を付ける（シールのように浮かせる）。 */
export function Card({
  raised = false,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div className={`sh-card ${raised ? 'sh-card--raised' : ''} ${className ?? ''}`} {...rest} />
  );
}
