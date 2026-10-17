import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';

/** primary：主の操作（オレンジ）。secondary：白いボタン。quiet：影の無い小さめのボタン。 */
export function Button({
  variant = 'secondary',
  className,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button type={type} className={`sh-btn sh-btn--${variant} ${className ?? ''}`} {...rest} />
  );
}
