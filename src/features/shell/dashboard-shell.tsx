import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Outlet, useRouter } from '@tanstack/react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Sidebar } from './sidebar'
import { BottomNav } from './bottom-nav'
import { useBackButton } from './back-button'
import { cn } from '@/lib/cn'

interface SidebarContextValue {
  open: boolean
  toggle: () => void
}

const SidebarContext = createContext<SidebarContextValue>({ open: true, toggle: () => {} })

export function useSidebar() {
  return useContext(SidebarContext)
}

/** Tablets and desktops (Tailwind's `lg`) keep the sidebar open. */
const WIDE = '(min-width: 1024px)'

function isWide(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches
}

/**
 * App shell: sidebar + scrollable main area, and on phones the bottom tab
 * bar. Pages render their own header row inside the main area.
 *
 * The sidebar animates instead of unmounting: on wide screens the wrapper's
 * width transitions (300px ↔ 0, clipping the aside); on phones the aside is
 * a fixed drawer that slides via translate-x while the scrim fades. Phones
 * start with it closed and close it after every navigation.
 */
export function DashboardShell() {
  const [open, setOpen] = useState(isWide)
  const toggle = () => setOpen((current) => !current)
  const router = useRouter()

  // Phones: every navigation closes the drawer.
  useEffect(
    () =>
      router.subscribe('onBeforeNavigate', () => {
        if (!isWide()) setOpen(false)
      }),
    [router],
  )

  useBackButton({ drawerOpen: open && !isWide(), closeDrawer: () => setOpen(false) })

  return (
    <TooltipProvider>
      <SidebarContext.Provider value={{ open, toggle }}>
        <div className="flex h-dvh overflow-hidden bg-paper">
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className={cn(
              'fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 lg:hidden',
              open ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          />
          <div
            className={cn(
              'z-50 h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-out',
              open ? 'w-0 lg:w-[300px]' : 'w-0',
            )}
          >
            <aside
              aria-hidden={!open}
              inert={!open}
              className={cn(
                'pt-safe pb-safe h-full w-[300px] max-w-[85vw] bg-paper transition-transform duration-300 ease-out',
                'fixed inset-y-0 left-0 lg:static',
                open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
              )}
            >
              <Sidebar onClose={() => setOpen(false)} />
            </aside>
          </div>
          <main className="pl-safe pr-safe flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {/* mobile: no in-app updater (the stores / release APKs update the app);
                nzap:// app links need the mobile deep-link plugin (PLAN.md phase 14). */}
            <Outlet />
          </main>
          <BottomNav />
        </div>
      </SidebarContext.Provider>
    </TooltipProvider>
  )
}

/** Icon button that reopens the sidebar (rendered by pages when it's hidden). */
export function SidebarRevealButton({ children }: { children: ReactNode }) {
  const { open, toggle } = useSidebar()
  if (open) return null
  return (
    <button
      type="button"
      aria-label="Open sidebar"
      onClick={toggle}
      className="grid size-10 cursor-pointer place-items-center rounded-lg text-graphite transition-colors hover:bg-paper-soft hover:text-ink"
    >
      {children}
    </button>
  )
}
