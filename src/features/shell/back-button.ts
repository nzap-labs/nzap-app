import { useEffect, useRef } from 'react'
import { useRouter } from '@tanstack/react-router'
import { call } from '@/lib/ipc'

export type BackAction = 'dismiss' | 'close-drawer' | 'navigate' | 'background'

/**
 * What the Android back button does, in order: close the topmost sheet,
 * dialog or menu; close the drawer; go back a page; otherwise send the app
 * to the background — never quit, so runtimes stay kept alive.
 */
export function backAction(state: {
  overlayOpen: boolean
  drawerOpen: boolean
  canGoBack: boolean
}): BackAction {
  if (state.overlayOpen) return 'dismiss'
  if (state.drawerOpen) return 'close-drawer'
  if (state.canGoBack) return 'navigate'
  return 'background'
}

/** Radix dialogs, sheets and menus that are open right now. */
function overlayOpen(): boolean {
  return Boolean(
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]',
    ),
  )
}

/** Radix layers close on Escape. */
function dismissOverlay() {
  const target = document.activeElement ?? document.body
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

/** Handle the Android back button (a no-op outside the app and on iOS). */
export function useBackButton(drawer: { drawerOpen: boolean; closeDrawer: () => void }) {
  const router = useRouter()
  const latest = useRef(drawer)
  useEffect(() => {
    latest.current = drawer
  })

  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return
    let cancelled = false
    let unregister: (() => Promise<void>) | undefined
    void import('@tauri-apps/api/app')
      .then(({ onBackButtonPress }) =>
        onBackButtonPress(() => {
          const action = backAction({
            overlayOpen: overlayOpen(),
            drawerOpen: latest.current.drawerOpen,
            canGoBack: router.history.canGoBack(),
          })
          if (action === 'dismiss') dismissOverlay()
          else if (action === 'close-drawer') latest.current.closeDrawer()
          else if (action === 'navigate') router.history.back()
          else void call('app_minimize').catch(() => undefined)
        }),
      )
      .then((listener) => {
        if (cancelled) void listener.unregister()
        else unregister = () => listener.unregister()
      })
      // Platforms without a back button reject the listener.
      .catch(() => undefined)
    return () => {
      cancelled = true
      void unregister?.()
    }
  }, [router])
}
