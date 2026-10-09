import { LogoWordmark } from '@/components/logo'

/** Shown when the UI is opened in a plain browser instead of the app. */
export function BrowserNotice() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <LogoWordmark />
      <h1 className="text-3xl font-medium tracking-tight">NZAP is an app</h1>
      <p className="max-w-md text-graphite">
        This page is its interface, which only works inside the app. Get NZAP for Android or iOS
        from the releases page.
      </p>
      <a
        href="https://github.com/nzap-labs/nzap-app/releases"
        className="rounded-3xl border border-ink px-6 py-3 font-medium transition-colors hover:bg-paper-soft"
      >
        Get NZAP
      </a>
    </main>
  )
}
