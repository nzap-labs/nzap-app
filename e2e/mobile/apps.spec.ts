import { expect, expectNoHorizontalScroll, fake, goTo, openApp, tabBar, test } from './fixtures'

test.describe('Phone apps', () => {
  test('opens Apps from the More sheet and runs Kokoro on a runtime it starts', async ({
    page,
  }) => {
    await openApp(page, { connected: true })
    await goTo(page, 'Apps')
    await expect(page.getByRole('heading', { name: 'Apps', level: 1 })).toBeVisible()
    await expect(tabBar(page).getByRole('button', { name: 'More' })).toBeVisible()

    // The search field keeps its height in the phone's column layout.
    const search = page.getByRole('textbox', { name: 'Search apps' })
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(24)
    await search.fill('kokoro')
    await expect(page.getByRole('link', { name: /Breeze TTS/ })).toHaveCount(0)
    await expectNoHorizontalScroll(page)

    await page.getByRole('link', { name: /Kokoro Text to Speech/ }).tap()
    await expect(page.getByRole('heading', { name: 'Kokoro Text to Speech' })).toBeVisible()
    await expect(page.getByText(/No runtime yet/)).toBeVisible()
    await expectNoHorizontalScroll(page)

    await page.getByRole('button', { name: 'Product intro' }).tap()
    await page.getByRole('button', { name: /Generate speech/ }).tap()
    await expect(page.getByText(/Runtime app-kokoro-tts is ready/)).toBeVisible()
    const play = page.getByRole('button', { name: 'Play' })
    await expect(play).toBeVisible()
    const box = (await play.boundingBox())!
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(40)
    expect(
      await fake(page, (state) => [...state.sessions.values()].map((s) => s.accelerator)),
    ).toEqual(['T4'])
    await expectNoHorizontalScroll(page)

    // The runtime the app started is an ordinary runtime in the workspace.
    await goTo(page, 'Runtimes')
    await expect(page.getByText('app-kokoro-tts').first()).toBeVisible()
  })
})
