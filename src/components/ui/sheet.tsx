import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const Sheet = DialogPrimitive.Root
export const SheetClose = DialogPrimitive.Close

/**
 * A bottom sheet: slides up from the bottom edge on phones, with a grab
 * handle and room for the gesture bar. Closes on the scrim, Escape or the
 * Android back button (see `useBackButton`).
 */
export function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="animate-fade-in fixed inset-0 z-50 bg-ink/30" />
      <DialogPrimitive.Content
        className={cn(
          'animate-sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto',
          'rounded-t-[24px] border border-b-0 border-ink bg-paper px-4 pt-2 pb-safe',
          'mx-auto w-full max-w-lg outline-none',
          className,
        )}
        {...props}
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        {children}
        <div aria-hidden className="h-4" />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn('px-2 text-lg font-medium tracking-tight text-ink', className)}
      {...props}
    />
  )
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('px-2 text-sm text-graphite', className)}
      {...props}
    />
  )
}
