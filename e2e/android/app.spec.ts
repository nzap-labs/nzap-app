// The real NZAP app on Android, end to end: the R8-minified release build,
// the real Rust engine and native plugin (Keystore secrets, loopback
// sign-in, keep-alive service), against nzap-mock-colab instead of Google.
import { expect, test, type Page } from '@playwright/test'
import { appIsRunning, closeDevice, launchApp, theDevice } from './device'

test.describe.configure({ mode: 'serial' })

let page: Page

test.afterAll(async () => {
  await closeDevice()
})

function tabBar() {
  return page.getByRole('navigation', { name: 'Sections' })
}

async function goTo(section: 'Runtimes' | 'Console' | 'Terminal' | 'Files') {
  await tabBar().getByRole('link', { name: section }).click()
  await expect(tabBar().getByRole('link', { name: section })).toHaveAttribute(
    'aria-current',
    'page',
  )
}

test('starts on onboarding', async () => {
  page = await launchApp()
  await expect(page.getByRole('region', { name: 'Welcome' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Google Auth' })).toContainText('not connected')
  const info = await page.evaluate(() =>
    (
      window as unknown as {
        __TAURI_INTERNALS__: { invoke: (cmd: string) => Promise<unknown> }
      }
    ).__TAURI_INTERNALS__.invoke('app_info'),
  )
  expect(info).toMatchObject({ os: 'android', mobile: true })
})

test('connects Google through the loopback redirect', async () => {
  await page.getByRole('button', { name: 'Connect Google' }).click()
  const card = page.getByRole('region', { name: 'Google Auth' })
  await expect(card).toContainText('Connected as ada@example.com', { timeout: 60_000 })
  // The refresh token went to the Android Keystore-backed store.
  await expect(card).toContainText('in secure storage')
  await expect(tabBar()).toBeVisible()
})

test('the connection survives a restart (Keystore secrets)', async () => {
  page = await launchApp()
  await expect(page.getByRole('region', { name: 'Google Auth' })).toContainText(
    'Connected as ada@example.com',
  )
})

test('launches a runtime and streams a cell', async () => {
  await goTo('Runtimes')
  await page.getByPlaceholder('my-runtime').fill('droid')
  await page.getByRole('button', { name: 'Launch runtime' }).click()
  const console = page.getByRole('region', { name: 'Console' })
  await expect(console).toBeVisible({ timeout: 90_000 })
  await console.getByLabel('Code').fill('print("hello from android")')
  await console.getByRole('button', { name: 'Run cell' }).click()
  await expect(console).toContainText('hello from android')
  await expect(console).toContainText('✓ finished')
})

test('answers an input() prompt', async () => {
  const console = page.getByRole('region', { name: 'Console' })
  await console.getByLabel('Code').fill('name = input("Name? ")')
  await console.getByRole('button', { name: 'Run cell' }).click()
  const answer = page.getByPlaceholder('type your answer and press Enter')
  await answer.fill('Ada')
  await answer.press('Enter')
  await expect(console).toContainText('Hello, Ada!')
})

test('opens a shell on the runtime', async () => {
  await goTo('Terminal')
  const terminal = page.getByRole('region', { name: 'Terminal' })
  await expect(terminal.locator('.xterm-rows')).toContainText('root@mock:/content#')
  const input = page.locator('.xterm-helper-textarea')
  await input.pressSequentially('whoami')
  await input.press('Enter')
  await expect(terminal.locator('.xterm-rows')).toContainText(/whoami\s*root/)
})

test('browses the runtime files', async () => {
  await goTo('Files')
  await expect(page.getByRole('region', { name: 'Files' })).toContainText('sample_data')
})

test('runs a public notebook with a parameter', async () => {
  await tabBar().getByRole('button', { name: 'More' }).click()
  await page
    .getByRole('dialog', { name: 'More' })
    .getByRole('link', { name: /^Notebooks/ })
    .click()
  const card = page.getByRole('listitem').filter({ hasText: 'Print Notebook' }).first()
  await card.getByRole('button', { name: 'Run' }).click()
  const dialog = page.getByRole('dialog').first()
  await dialog.locator('input').first().fill('Hi from a notebook')
  await dialog.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(dialog).toContainText('Hi from a notebook')
  await page.keyboard.press('Escape')
})

test('the keep-alive notification runs while a runtime is kept alive', async () => {
  const phone = await theDevice()
  await expect
    .poll(
      async () => (await phone.shell('dumpsys activity services com.nzaplabs.app')).toString(),
      { timeout: 45_000 },
    )
    .toContain('KeepAliveService')
})

test('releases the runtime and disconnects', async () => {
  await goTo('Runtimes')
  const runtimes = page.getByRole('region', { name: 'Runtimes' })
  await runtimes.getByRole('button', { name: 'Stop' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Stop and release' }).click()
  await expect(runtimes).toContainText('No runtimes yet')

  await page
    .getByRole('region', { name: 'Google Auth' })
    .getByRole('button', { name: 'Disconnect' })
    .click()
  await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click()
  await expect(page.getByRole('region', { name: 'Google Auth' })).toContainText('not connected')
  expect(await appIsRunning()).toBe(true)
})
