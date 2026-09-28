import type { Page } from '@playwright/test'
import { expect, fake, openApp, test } from '../web/fixtures'

export { expect, fake, openApp, test }

type PrimarySection = 'Runtimes' | 'Console' | 'Terminal' | 'Files'
type MoreSection = 'Run & jobs' | 'Notebooks' | 'Account' | 'Settings' | 'Chat'

/** The bottom tab bar. */
export function tabBar(page: Page) {
  return page.getByRole('navigation', { name: 'Sections' })
}

/** Tap a section in the bottom tab bar, or open it from the More sheet. */
export async function goTo(page: Page, section: PrimarySection | MoreSection) {
  const bar = tabBar(page)
  if (['Runtimes', 'Console', 'Terminal', 'Files'].includes(section)) {
    await bar.getByRole('link', { name: section }).tap()
    await expect(bar.getByRole('link', { name: section })).toHaveAttribute('aria-current', 'page')
    return
  }
  await bar.getByRole('button', { name: 'More' }).tap()
  const sheet = page.getByRole('dialog', { name: 'More' })
  await sheet.getByRole('link', { name: new RegExp(`^${escape(section)}`) }).tap()
  await expect(sheet).toHaveCount(0)
}

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')
}

/** Launch a runtime from the Runtimes section and wait for the console. */
export async function launchRuntime(page: Page, name = 'box') {
  await goTo(page, 'Runtimes')
  await page.getByPlaceholder('my-runtime').fill(name)
  await page.getByRole('button', { name: 'Launch runtime' }).tap()
  await expect(page.getByText(`Runtime ${name} is ready`)).toBeVisible()
  await expect(tabBar(page).getByRole('link', { name: 'Console' })).toHaveAttribute(
    'aria-current',
    'page',
  )
}

/** Nothing on the page is wider than the screen (no sideways scrolling). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.scrollingElement!
    const main = document.querySelector('main')!
    const scrollers = [root, main, ...main.querySelectorAll<HTMLElement>('.overflow-y-auto')]
    return scrollers
      .filter((element) => !element.closest('.xterm'))
      .map((element) => element.scrollWidth - element.clientWidth)
      .reduce((max, value) => Math.max(max, value), 0)
  })
  expect(overflow, 'content wider than the screen').toBeLessThanOrEqual(1)
}
