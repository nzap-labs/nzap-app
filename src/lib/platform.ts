import { useQuery } from '@tanstack/react-query'
import { appInfoQuery } from '@/api/app'

/**
 * True in the Android / iOS app. The layout itself follows the viewport
 * (phones get the bottom tab bar, tablets the desktop layout); this flag
 * only switches platform wording and features: sharing instead of folders,
 * background keep-alive instead of the tray.
 */
export function useIsMobileApp(): boolean {
  const { data } = useQuery(appInfoQuery)
  return data?.mobile ?? false
}

/** The toast after a save: a full path on desktop, a file name on phones. */
export function savedMessage(saved: string): string {
  return /[/\\]/.test(saved) ? `Saved to ${saved}.` : `Saved ${saved}.`
}
