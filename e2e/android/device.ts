import { execFileSync } from 'node:child_process'
import { _android as android, type AndroidDevice, type Page } from '@playwright/test'

export const PACKAGE = 'com.nzaplabs.app'
const ACTIVITY = `${PACKAGE}/.MainActivity`
/** Host port forwarded to the app's WebView devtools socket. */
const CDP_PORT = 9223

let device: AndroidDevice | undefined

/** The emulator (the only device attached). */
export async function theDevice(): Promise<AndroidDevice> {
  if (device) return device
  const devices = await android.devices()
  if (devices.length === 0) throw new Error('No Android device or emulator is attached.')
  device = devices[0]
  return device
}

/**
 * Start the app (a fresh process unless `restart` is false) and attach to its
 * WebView. Needs WebView debugging, which only the e2e build has.
 *
 * The app's devtools socket (`webview_devtools_remote_<pid>`) opens before
 * the WebView has loaded anything, and Playwright's `webView.page()` then
 * resolves to no page (or waits forever). So: forward the socket with adb,
 * wait until DevTools lists the page, and only then attach through
 * Playwright's WebView support (a WebView has no browser-level CDP, so a
 * plain `connectOverCDP` is refused). Every step has a timeout.
 */
export async function launchApp({ restart = true } = {}): Promise<Page> {
  const phone = await theDevice()
  if (restart) await phone.shell(`am force-stop ${PACKAGE}`)
  await phone.shell(`am start -W -n ${ACTIVITY}`)
  const pid = await waitForPid()
  const socketName = `webview_devtools_remote_${pid}`

  adb('forward', '--remove-all')
  adb('forward', `tcp:${CDP_PORT}`, `localabstract:${socketName}`)
  await waitForPageTarget(`http://127.0.0.1:${CDP_PORT}`)

  const webView = await phone.webView({ socketName }, { timeout: 60_000 })
  const page = await withTimeout(webView.page(), 60_000, 'Attaching to the WebView page')
  if (!page) throw new Error('Playwright attached to the WebView but found no page.')
  await page.waitForLoadState('domcontentloaded')
  return page
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms.`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/** Wait until DevTools lists a page in the app's WebView. */
async function waitForPageTarget(endpoint: string) {
  let seen = 'nothing'
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(`${endpoint}/json/list`)
      const targets = (await response.json()) as { type: string; url: string }[]
      seen = JSON.stringify(targets.map(({ type, url }) => ({ type, url })))
      if (targets.some((target) => target.type === 'page')) {
        console.log(`WebView targets: ${seen}`)
        return
      }
    } catch (error) {
      seen = String(error)
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`The app's WebView never listed a page (last seen: ${seen}).`)
}

function adb(...args: string[]) {
  execFileSync('adb', args, { stdio: 'pipe' })
}

async function waitForPid(): Promise<string> {
  const phone = await theDevice()
  for (let attempt = 0; attempt < 60; attempt++) {
    const pid = (await phone.shell(`pidof ${PACKAGE}`)).toString().trim().split(/\s+/)[0]
    if (pid) return pid
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`${PACKAGE} did not start`)
}

/** Is the app's process alive (no crash)? */
export async function appIsRunning(): Promise<boolean> {
  const phone = await theDevice()
  const pid = (await phone.shell(`pidof ${PACKAGE}`)).toString().trim()
  return pid.length > 0
}

export async function closeDevice() {
  await device?.close()
  device = undefined
}
