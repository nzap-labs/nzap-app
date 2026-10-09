import { describe, expect, it } from 'vitest'
import { backAction } from './back-button'

describe('the Android back button', () => {
  it('closes layers from the top down, then navigates, then backgrounds the app', () => {
    const base = { overlayOpen: false, drawerOpen: false, canGoBack: false }
    expect(backAction({ ...base, overlayOpen: true, drawerOpen: true, canGoBack: true })).toBe(
      'dismiss',
    )
    expect(backAction({ ...base, drawerOpen: true, canGoBack: true })).toBe('close-drawer')
    expect(backAction({ ...base, canGoBack: true })).toBe('navigate')
    // Never quits: runtimes stay kept alive in the background.
    expect(backAction(base)).toBe('background')
  })
})
