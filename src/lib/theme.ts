export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'nzap.theme'

let current: Theme = 'light'
const listeners = new Set<() => void>()

export function getThemeSnapshot(): Theme {
  return current
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // storage unavailable — fall through to system preference
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Sync the <html> class + color-scheme with the given theme. */
export function applyTheme(theme: Theme): void {
  current = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
  document
    .querySelector('meta[name="theme-color"]')
    // mobile: the brand's paper colours (the engine still has the old ones).
    ?.setAttribute('content', theme === 'dark' ? '#0a0a0b' : '#f6f6f3')
  syncSystemBars(theme)
}

/** Phones: status and navigation bar icons that stay readable. */
function syncSystemBars(theme: Theme): void {
  if (!('__TAURI_INTERNALS__' in window)) return
  void import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('app_set_theme', { dark: theme === 'dark' }))
    .catch(() => undefined)
}

/** Called once before React mounts so there is no theme flash. */
export function initTheme(): void {
  applyTheme(readInitialTheme())
}

function emit(): void {
  listeners.forEach((listener) => listener())
}

export function toggleTheme(): Theme {
  const next: Theme = current === 'dark' ? 'light' : 'dark'
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // private mode — theme still applies for this page view
  }
  // momentary class enables a smooth cross-fade of surfaces (see app.css)
  document.documentElement.classList.add('theming')
  window.setTimeout(() => document.documentElement.classList.remove('theming'), 400)
  applyTheme(next)
  emit()
  return next
}
