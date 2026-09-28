import { Cpu, FileUp, FolderOpen, NotebookPen, SquareTerminal, Terminal } from 'lucide-react'

/** The Colab workspace's sections, addressable as `/colab?tab=…`. */
export type Tab = 'runtimes' | 'console' | 'terminal' | 'run' | 'notebooks' | 'files'

export const TABS: { id: Tab; label: string; icon: typeof Cpu }[] = [
  { id: 'runtimes', label: 'Runtimes', icon: Cpu },
  { id: 'console', label: 'Console', icon: Terminal },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
  { id: 'run', label: 'Run', icon: FileUp },
  { id: 'notebooks', label: 'Notebooks', icon: NotebookPen },
  { id: 'files', label: 'Files', icon: FolderOpen },
]

export const DEFAULT_TAB: Tab = 'runtimes'

export function isTab(value: unknown): value is Tab {
  return TABS.some((item) => item.id === value)
}
