import { _android as android, type AndroidDevice, type Page } from '@playwright/test'

export const PACKAGE = 'com.nzaplabs.app'
const ACTIVITY = `${PACKAGE}/.MainActivity`

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
 * Start the app (fresh process unless `keepRunning`) and attach to its
 * WebView. Needs WebView debugging, which only the e2e build has.
 */
export async function launchApp({ restart = true } = {}): Promise<Page> {
  const phone = await theDevice()
  if (restart) await phone.shell(`am force-stop ${PACKAGE}`)
  await phone.shell(`am start -W -n ${ACTIVITY}`)
  const webView = await phone.webView({ pkg: PACKAGE }, { timeout: 60_000 })
  const page = await webView.page()
  await page.waitForLoadState('domcontentloaded')
  return page
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
