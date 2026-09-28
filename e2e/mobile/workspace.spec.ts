import { expect, fake, goTo, launchRuntime, openApp, test } from './fixtures'

test.describe('Phone workspace', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { connected: true })
    await launchRuntime(page)
  })

  test('console: run a cell, answer input(), save the history', async ({ page }) => {
    // The Google card stays on Runtimes; the console starts near the top.
    await expect(page.getByRole('region', { name: 'Google Auth' })).toBeHidden()
    await page.getByLabel('Code').fill('print("hello from the phone")')
    await page.getByRole('button', { name: 'Run cell' }).tap()
    await expect(page.getByText('hello from the phone', { exact: true })).toBeVisible()

    await page.getByLabel('Code').fill('name = input("Name? ")')
    await page.getByRole('button', { name: 'Run cell' }).tap()
    const answer = page.getByPlaceholder('type your answer and press Enter')
    await answer.fill('Grace')
    await answer.press('Enter')
    await expect(page.getByText('Hello, Grace!')).toBeVisible()

    const history = page.getByRole('region', { name: 'History' })
    await history.getByRole('button', { name: 'Refresh history' }).tap()
    await history.getByRole('button', { name: 'Notebook' }).tap()
    // Phones save through the system picker and name the file.
    await expect(page.getByText('Saved box.ipynb.')).toBeVisible()
  })

  test('terminal: type, and use the key bar for Ctrl-C', async ({ page }) => {
    await goTo(page, 'Terminal')
    const terminal = page.getByRole('region', { name: 'Terminal' })
    await expect(terminal.getByText('root@fake:/content#').first()).toBeVisible()
    const input = page.locator('.xterm-helper-textarea')
    await input.pressSequentially('whoami')
    await input.press('Enter')
    await expect(terminal.getByText(/^root$/)).toBeVisible()

    const keys = page.getByRole('toolbar', { name: 'Terminal keys' })
    await expect(keys).toBeVisible()
    await input.pressSequentially('sleep 100')
    const ctrl = keys.getByRole('button', { name: 'Control' })
    await ctrl.tap()
    await expect(ctrl).toHaveAttribute('aria-pressed', 'true')
    await input.pressSequentially('c')
    await expect(terminal.getByText('^C')).toBeVisible()
    // Sticky modifiers release after one key.
    await expect(ctrl).toHaveAttribute('aria-pressed', 'false')
  })

  test('files: upload from the chooser, rename and delete in sheets', async ({ page }) => {
    await goTo(page, 'Files')
    const files = page.getByRole('region', { name: 'Files' })
    await files.locator('input[type="file"]').setInputFiles({
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('not really a jpeg'),
    })
    await expect(page.getByText('Uploaded photo.jpg.')).toBeVisible()

    await files.getByRole('button', { name: 'Rename photo.jpg' }).tap()
    const rename = page.getByRole('dialog', { name: 'Rename photo.jpg' })
    // Dialogs are bottom sheets on phones (centred from 640 px, e.g. tablets).
    const viewport = page.viewportSize()!
    if (viewport.width < 640) {
      const box = (await rename.boundingBox())!
      expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(viewport.height - 1)
    }
    await rename.getByRole('textbox').fill('cat.jpg')
    await rename.getByRole('button', { name: 'OK' }).tap()
    await expect(files.getByRole('button', { name: /^cat\.jpg/ })).toBeVisible()

    await files.getByRole('button', { name: 'Delete cat.jpg' }).tap()
    await page
      .getByRole('dialog', { name: 'Delete cat.jpg?' })
      .getByRole('button', { name: 'Delete' })
      .tap()
    await expect(files.getByRole('button', { name: /^cat\.jpg/ })).toHaveCount(0)
  })

  test('notebooks: run a public notebook, import one from a file', async ({ page }) => {
    await goTo(page, 'Notebooks')
    const collection = page.getByRole('region', { name: 'Public collection' })
    await collection.getByRole('button', { name: 'Run' }).first().tap()
    const dialog = page.getByRole('dialog').first()
    await dialog.getByRole('button', { name: /^Run/ }).last().tap()
    await expect(dialog.getByText(/✓ finished|finished/).first()).toBeVisible()
    await page.keyboard.press('Escape')

    const mine = page.getByRole('region', { name: 'Your notebooks' })
    await mine.getByLabel('Notebook file to import').setInputFiles({
      name: 'mine.nzap.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          format: 'nzap-notebook/1',
          slug: 'phone-made',
          title: 'Made on a phone',
          description: '',
          source: 'print("hi")',
          params: [],
        }),
      ),
    })
    await expect(page.getByText('Imported Made on a phone.')).toBeVisible()
    await expect(mine.getByText('Made on a phone')).toBeVisible()
  })

  test('jobs: artifacts are shared from the phone', async ({ page }) => {
    await goTo(page, 'Run & jobs')
    const jobs = page.getByRole('region', { name: 'Jobs' })
    await jobs.getByLabel('Script', { exact: true }).fill('print("training")')
    await jobs.getByPlaceholder(/out\/\*\.png/).fill('out/*')
    await jobs.getByRole('button', { name: 'Run job' }).tap()
    await expect(jobs.getByText('Exit code 0 · VM released')).toBeVisible()
    await jobs.getByRole('button', { name: 'Share /content/out/result.txt' }).tap()
    expect(await fake(page, (state) => state.shared.at(-1))).toContain('result.txt')
  })

  test('settings: background keep-alive and the diagnostics log', async ({ page }) => {
    await goTo(page, 'Settings')
    const background = page.getByRole('checkbox', {
      name: 'Keep runtimes alive in the background',
    })
    await expect(background).toBeVisible()
    await background.tap()
    await expect(
      page.getByText(
        /Runtimes (now stay alive while NZAP is in the background|are now kept alive only while NZAP is open)/,
      ),
    ).toBeVisible()
    // Phones keep artifacts in the app; there is no folder to pick.
    await expect(page.getByRole('region', { name: 'Job artifacts' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Share diagnostics log' }).tap()
    expect(await fake(page, (state) => state.shared)).toContain('nzap.log')
  })
})
