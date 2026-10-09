import { createFileRoute } from '@tanstack/react-router'
import { ColabWorkspace } from '@/features/colab/colab-workspace'
import { isTab, type Tab } from '@/features/colab/workspace-tabs'

export interface ColabSearch {
  tab?: Tab
}

export const Route = createFileRoute('/colab')({
  // The section is part of the URL, so the Android back button (and the
  // bottom tab bar) move between sections like pages.
  validateSearch: (search: Record<string, unknown>): ColabSearch =>
    isTab(search.tab) ? { tab: search.tab } : {},
  component: ColabWorkspace,
})
