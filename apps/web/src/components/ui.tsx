import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { AlertIcon, XIcon } from './icons';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(16,24,20,0.04),0_8px_24px_-12px_rgba(16,24,20,0.12)]',
        className,
      )}
      {...props}
    />
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-contrast hover:bg-brand-strong shadow-sm focus-visible:outline-brand',
  secondary:
    'border border-line bg-surface text-foreground hover:bg-surface-2 focus-visible:outline-brand',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm focus-visible:outline-danger',
  ghost: 'text-muted hover:bg-surface-2 hover:text-foreground focus-visible:outline-brand',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition',
        'focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        buttonVariants[variant],
        className,
      )}
      {...props}
    />
  );
}

type Tone = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

const badgeTones: Record<Tone, string> = {
  brand: 'bg-brand-soft text-brand',
  success: 'bg-success-soft text-success',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  neutral: 'bg-surface-2 text-muted',
};

export function Badge({
  tone = 'neutral',
  pulse = false,
  children,
}: {
  tone?: Tone;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        badgeTones[tone],
      )}
    >
      <span className="relative flex size-1.5">
        {pulse && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
        )}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {children}
    </span>
  );
}

export function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      <AlertIcon className="mt-0.5 shrink-0" width={18} height={18} />
      <div className="flex-1 break-words">{children}</div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <XIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        'inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent',
        className,
      )}
      aria-hidden
    />
  );
}

type NoticeTone = 'warning' | 'success' | 'danger';

const noticeTones: Record<NoticeTone, string> = {
  warning: 'border-warning/30 bg-warning-soft text-warning',
  success: 'border-success/30 bg-success-soft text-success',
  danger: 'border-danger/30 bg-danger-soft text-danger',
};

/** A titled message about what is happening and what the learner should do. */
export function Notice({
  tone,
  title,
  icon,
  children,
  onDismiss,
}: {
  tone: NoticeTone;
  title: string;
  icon?: ReactNode;
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-xl border px-4 py-3', noticeTones[tone])}
    >
      <span className="mt-0.5 shrink-0">{icon ?? <AlertIcon width={18} height={18} />}</span>
      <div className="flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {children && <div className="mt-1 text-sm text-foreground/80">{children}</div>}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-70 hover:opacity-100"
          aria-label="Dismiss"
        >
          <XIcon width={16} height={16} />
        </button>
      )}
    </div>
  );
}
