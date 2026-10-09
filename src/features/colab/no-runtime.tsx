import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Cpu } from 'lucide-react'

/**
 * mobile: the empty state of a section that needs a runtime. It says what
 * to do and links to Runtimes, so a phone (where the runtime list is on its
 * own tab) is never left at a dead end.
 */
export function NoRuntime({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[24px] border border-line bg-paper p-8 text-center">
      <span className="mx-auto block w-fit text-graphite [&_svg]:size-6">{icon}</span>
      <p className="mt-3 text-sm text-graphite">{children}</p>
      <Link
        to="/colab"
        search={{ tab: 'runtimes' }}
        className="mt-4 inline-flex h-11 items-center gap-2 rounded-3xl border border-ink px-5 text-sm font-medium transition-colors hover:bg-paper-soft active:bg-paper-soft"
      >
        <Cpu className="size-4" /> Go to Runtimes
      </Link>
    </section>
  )
}
