import {
  expect,
  expectNoHorizontalScroll,
  fake,
  goTo,
  launchRuntime,
  openApp,
  tabBar,
  test,
} from './fixtures'

test.describe('Phone shell', () => {
  test('first launch: onboarding, then Google connects and the tab bar appears', async ({
    page,
  }) => {
    await openApp(page)
    await expect(page.getByRole('region', { name: 'Welcome' })).toBeVisible()
    await expect(page.getByText('Your Colab runtimes, from your phone.')).toBeVisible()
    // Nothing to navigate before connecting.
    await expect(tabBar(page)).toHaveCount(0)
    await expectNoHorizontalScroll(page)

    await page.getByRole('button', { name: 'Connect Google' }).tap()
    await expect(page.getByRole('region', { name: 'Welcome' })).toHaveCount(0)
    expect(await fake(page, (state) => state.opened[0])).toContain('accounts.google.com')
    await expect(tabBar(page)).toBeVisible()
    await expect(tabBar(page).getByRole('link', { name: 'Runtimes' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('the tab bar moves between sections, and back goes back', async ({ page }) => {
    await openApp(page, { connected: true })
    await launchRuntime(page)
    for (const section of ['Terminal', 'Files', 'Runtimes', 'Console'] as const) {
      await goTo(page, section)
      await expectNoHorizontalScroll(page)
    }
    await expect(page).toHaveURL(/tab=console/)
    // Back walks the sections in reverse, like pages.
    await page.goBack()
    await expect(page).toHaveURL(/tab=runtimes/)
    await page.goBack()
    await expect(tabBar(page).getByRole('link', { name: 'Files' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  test('the More sheet reaches every other page and closes like a sheet', async ({ page }) => {
    await openApp(page, { connected: true })
    const bar = tabBar(page)

    await bar.getByRole('button', { name: 'More' }).tap()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet).toBeVisible()
    // A bottom sheet: pinned to the bottom edge of the screen.
    const box = (await sheet.boundingBox())!
    const viewport = page.viewportSize()!
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(viewport.height - 1)
    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)

    for (const section of ['Run & jobs', 'Notebooks', 'Account', 'Settings'] as const) {
      await goTo(page, section)
      await expect(bar.getByRole('button', { name: 'More' })).toBeVisible()
      await expectNoHorizontalScroll(page)
    }
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // The theme switch lives in the sheet.
    await bar.getByRole('button', { name: 'More' }).tap()
    await page
      .getByRole('dialog', { name: 'More' })
      .getByRole('button', { name: /dark mode/ })
      .tap()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('the drawer opens from the header and closes on the scrim or navigation', async ({
    page,
  }) => {
    await openApp(page, { connected: true })
    // Phones start with the drawer closed.
    const openButton = page.getByRole('button', { name: 'Open sidebar' })
    await expect(openButton).toBeVisible()
    await openButton.tap()
    const drawer = page.getByRole('link', { name: 'Colab', exact: true })
    await expect(drawer).toBeVisible()

    await page.mouse.click(page.viewportSize()!.width - 10, 300)
    await expect(openButton).toBeVisible()

    await openButton.tap()
    await page.getByRole('button', { name: /Ada Lovelace/ }).tap()
    await page.getByRole('menuitem', { name: 'Settings' }).tap()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(openButton).toBeVisible()
  })

  test('touch targets in the tab bar are at least 44 px', async ({ page }) => {
    await openApp(page, { connected: true })
    const items = tabBar(page).locator('a, button')
    await expect(items).toHaveCount(5)
    for (const item of await items.all()) {
      const box = (await item.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
  })

  test('Runtimes leads with the runtimes: the Google card folds into a row', async ({ page }) => {
    await openApp(page, { connected: true })
    const card = page.getByRole('region', { name: 'Google Auth' })
    const toggle = card.getByRole('button', { name: 'Show Google account details' })
    await expect(toggle).toContainText('ada@example.com')
    await expect(card.getByRole('button', { name: 'Disconnect' })).toBeHidden()
    // "New runtime" is on the first screen.
    const heading = page.getByText('New runtime', { exact: true })
    await expect(heading).toBeInViewport()

    await toggle.tap()
    await expect(card.getByRole('button', { name: 'Disconnect' })).toBeVisible()
    await expect(card).toContainText('in secure storage')
    await card.getByRole('button', { name: 'Hide Google account details' }).tap()
    await expect(card.getByRole('button', { name: 'Disconnect' })).toBeHidden()
  })

  test('sections that need a runtime lead to Runtimes', async ({ page }) => {
    await openApp(page, { connected: true })
    for (const section of ['Console', 'Terminal', 'Files'] as const) {
      await goTo(page, section)
      await page.getByRole('link', { name: 'Go to Runtimes' }).tap()
      await expect(tabBar(page).getByRole('link', { name: 'Runtimes' })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await expect(page.getByPlaceholder('my-runtime')).toBeVisible()
    }
  })

  test('settings fields use the width of the phone', async ({ page }) => {
    await openApp(page, { connected: true })
    await goTo(page, 'Settings')
    const field = page.getByRole('textbox', { name: 'Catalog URL' })
    const width = (await field.boundingBox())!.width
    expect(width).toBeGreaterThan(page.viewportSize()!.width * 0.6)
    await expectNoHorizontalScroll(page)
  })
})
