import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/cn'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="animate-fade-in fixed inset-0 z-50 bg-ink/30" />
      <DialogPrimitive.Content
        className={cn(
          // Phones: a bottom sheet above the gesture bar and the keyboard.
          'animate-sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] w-full overflow-y-auto',
          'rounded-t-[24px] border border-b-0 border-ink bg-paper p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
          // Wider screens: a centred dialog, as on desktop.
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:max-w-md',
          'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border-b sm:pb-6',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className="absolute right-3 top-3 grid size-10 cursor-pointer place-items-center rounded-full text-graphite transition-colors hover:bg-paper-soft hover:text-ink"
        >
          <X className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('text-xl font-medium tracking-tight text-ink', className)}
      {...props}
    />
  )
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('mt-2 text-sm leading-relaxed text-graphite', className)}
      {...props}
    />
  )
}
