import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import {
  CheckCircleIcon as CircleCheckIcon,
  InfoIcon,
  WarningIcon as TriangleAlertIcon,
  XCircleIcon as OctagonXIcon,
  SpinnerIcon as Loader2Icon,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

function Toaster({ className, style, toastOptions, ...props }: ToasterProps) {
  return (
    <Sonner
      theme="system"
      visibleToasts={3}
      closeButton
      className={cn('toaster group', className)}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius-overlay)',
          fontFamily: 'var(--font-ui)',
          ...style,
        } as CSSProperties
      }
      toastOptions={{
        ...toastOptions,
        classNames: {
          ...toastOptions?.classNames,
          toast: cn('toast', toastOptions?.classNames?.toast),
          closeButton: cn('toast-close', toastOptions?.classNames?.closeButton),
          actionButton: cn('toast-action', toastOptions?.classNames?.actionButton),
          cancelButton: cn('toast-action', toastOptions?.classNames?.cancelButton),
        },
      }}
      {...props}
    />
  );
}
export { Toaster };
