import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Cpu,
  Ellipsis,
  FileUp,
  FolderOpen,
  NotebookPen,
  SlidersHorizontal,
  SquarePen,
  SquareTerminal,
  Terminal,
  UserRound,
} from 'lucide-react'
import { colabStatusQuery } from '@/api/colab'
import { ThemeToggle } from '@/components/theme-toggle'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/cn'
import { DEFAULT_TAB, isTab, type Tab } from '@/features/colab/workspace-tabs'

/** Sections in the bar itself; the rest live in the "More" sheet. */
const PRIMARY: { tab: Tab; label: string; icon: typeof Cpu }[] = [
  { tab: 'runtimes', label: 'Runtimes', icon: Cpu },
  { tab: 'console', label: 'Console', icon: Terminal },
  { tab: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { tab: 'files', label: 'Files', icon: FolderOpen },
]

/** Where the app is, as the tab bar sees it. */
function useLocationKey(): { path: string; tab: Tab | null } {
  return useRouterState({
    select: (state) => {
      const search = state.location.search as { tab?: unknown }
      const path = state.location.pathname
      return {
        path,
        tab: path === '/colab' ? (isTab(search.tab) ? search.tab : DEFAULT_TAB) : null,
      }
    },
    structuralSharing: true,
  })
}

/**
 * The phone's bottom tab bar, in NZAP's style: paper surface, ink hairline,
 * a sunshine pill behind the active section. Tablets and desktops (lg and
 * up) keep the sidebar and the workspace's pill tabs instead.
 */
export function BottomNav() {
  const { data: status } = useQuery(colabStatusQuery)
  const { path, tab } = useLocationKey()
  const [moreOpen, setMoreOpen] = useState(false)

  // Before Google is connected the workspace is the onboarding screen.
  if (!status?.connected) return null

  const moreActive =
    tab === 'run' || tab === 'notebooks' || ['/account', '/settings', '/chat'].includes(path)

  return (
    <>
      <nav
        aria-label="Sections"
        className="pb-safe pl-safe pr-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {PRIMARY.map((item) => (
            <li key={item.tab}>
              <Link
                to="/colab"
                search={{ tab: item.tab }}
                aria-current={tab === item.tab ? 'page' : undefined}
                className="group flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-graphite aria-[current=page]:text-ink"
              >
                <NavIcon active={tab === item.tab}>
                  <item.icon />
                </NavIcon>
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
              className={cn(
                'flex h-16 w-full cursor-pointer flex-col items-center justify-center gap-1 text-[11px] font-medium',
                moreActive ? 'text-ink' : 'text-graphite',
              )}
            >
              <NavIcon active={moreActive}>
                <Ellipsis />
              </NavIcon>
              More
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} path={path} tab={tab} />
    </>
  )
}

function NavIcon({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid h-7 w-12 place-items-center rounded-full transition-colors [&_svg]:size-5',
        active ? 'bg-sunshine text-on-sunshine' : 'group-active:bg-paper-soft',
      )}
    >
      {children}
    </span>
  )
}

function MoreSheet({
  open,
  onOpenChange,
  path,
  tab,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  path: string
  tab: Tab | null
}) {
  const close = () => onOpenChange(false)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby="more-sheet-description">
        <SheetTitle>More</SheetTitle>
        <SheetDescription id="more-sheet-description">
          Run files and jobs, notebooks, your account and settings.
        </SheetDescription>
        <ul className="mt-3 space-y-1">
          <MoreItem
            icon={<FileUp />}
            label="Run & jobs"
            hint="Run a file or an ephemeral job"
            active={tab === 'run'}
            onSelect={close}
            link={{ to: '/colab', search: { tab: 'run' } }}
          />
          <MoreItem
            icon={<NotebookPen />}
            label="Notebooks"
            hint="The public collection and yours"
            active={tab === 'notebooks'}
            onSelect={close}
            link={{ to: '/colab', search: { tab: 'notebooks' } }}
          />
          <MoreItem
            icon={<UserRound />}
            label="Account"
            hint="Google, Colab plan and compute units"
            active={path === '/account'}
            onSelect={close}
            link={{ to: '/account' }}
          />
          <MoreItem
            icon={<SlidersHorizontal />}
            label="Settings"
            hint="Keep-alive, notebooks, sign-in client"
            active={path === '/settings'}
            onSelect={close}
            link={{ to: '/settings' }}
          />
          <MoreItem
            icon={<SquarePen />}
            label="Chat"
            hint="On the roadmap"
            active={path === '/chat'}
            onSelect={close}
            link={{ to: '/chat' }}
          />
        </ul>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-line px-4 py-2">
          <span className="text-sm font-medium">Theme</span>
          <ThemeToggle className="p-2.5" />
        </div>
      </SheetContent>
    </Sheet>
  )
}

type MoreLink =
  | { to: '/colab'; search: { tab: Tab } }
  | { to: '/account' }
  | { to: '/settings' }
  | { to: '/chat' }

function MoreItem({
  icon,
  label,
  hint,
  active,
  onSelect,
  link,
}: {
  icon: ReactNode
  label: string
  hint: string
  active: boolean
  onSelect: () => void
  link: MoreLink
}) {
  return (
    <li>
      <Link
        {...link}
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 transition-colors active:bg-paper-soft',
          active && 'bg-paper-soft',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-full border [&_svg]:size-5',
            active ? 'border-ink bg-sunshine text-on-sunshine' : 'border-line',
          )}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block font-medium">{label}</span>
          <span className="block truncate text-xs text-graphite">{hint}</span>
        </span>
      </Link>
    </li>
  )
}
