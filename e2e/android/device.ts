import { execFileSync } from 'node:child_process'
import {
  _android as android,
  chromium,
  type AndroidDevice,
  type Browser,
  type Page,
} from '@playwright/test'

export const PACKAGE = 'com.nzaplabs.app'
const ACTIVITY = `${PACKAGE}/.MainActivity`
/** Host port forwarded to the app's WebView devtools socket. */
const CDP_PORT = 9223

let device: AndroidDevice | undefined
let browser: Browser | undefined

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
 * WebView over the Chrome DevTools Protocol. Needs WebView debugging, which
 * only the e2e build has.
 *
 * The app's devtools socket (`webview_devtools_remote_<pid>`) is forwarded
 * to the host with adb, and Playwright connects once DevTools lists the
 * page — the socket opens before the WebView has loaded anything, and
 * attaching then finds no page. Every step has a timeout and says what it saw.
 */
export async function launchApp({ restart = true } = {}): Promise<Page> {
  const phone = await theDevice()
  await browser?.close().catch(() => undefined)
  browser = undefined
  if (restart) await phone.shell(`am force-stop ${PACKAGE}`)
  await phone.shell(`am start -W -n ${ACTIVITY}`)
  const pid = await waitForPid()

  adb('forward', '--remove-all')
  adb('forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`)
  const endpoint = `http://127.0.0.1:${CDP_PORT}`
  await waitForPageTarget(endpoint)

  browser = await chromium.connectOverCDP(endpoint, { timeout: 60_000 })
  const context = browser.contexts()[0]
  if (!context) throw new Error('The WebView has no browser context.')
  const page =
    context.pages().find((candidate) => !candidate.url().startsWith('about:')) ??
    context.pages()[0] ??
    (await context.waitForEvent('page', { timeout: 30_000 }))
  await page.waitForLoadState('domcontentloaded')
  return page
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
  await browser?.close().catch(() => undefined)
  browser = undefined
  await device?.close()
  device = undefined
}
