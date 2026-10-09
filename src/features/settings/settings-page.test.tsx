import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderWithEngine } from '@/test/render'
import { SettingsPage } from './settings-page'

describe('SettingsPage', () => {
  it('turns keep-alive and close-to-tray on and off', async () => {
    const { user, engine } = renderWithEngine(<SettingsPage />)
    const keepAlive = await screen.findByRole('checkbox', {
      name: 'Keep runtimes alive while NZAP is open',
    })
    const tray = screen.getByRole('checkbox', {
      name: 'Keep running in the system tray when the window is closed',
    })
    expect(tray).not.toBeChecked()

    await user.click(tray)
    expect(
      await screen.findByText('Closing the window now keeps NZAP in the system tray.'),
    ).toBeInTheDocument()
    expect(engine.state.settings.closeToTray).toBe(true)
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', {
          name: 'Keep running in the system tray when the window is closed',
        }),
      ).toBeChecked(),
    )

    const wasOn = engine.state.settings.keepAlive
    await user.click(keepAlive)
    await waitFor(() => expect(engine.state.settings.keepAlive).toBe(!wasOn))
  })

  it('uses the phone wording in the mobile app', async () => {
    const { user, engine } = renderWithEngine(<SettingsPage />, { mobile: true })
    const background = await screen.findByRole('checkbox', {
      name: 'Keep runtimes alive in the background',
    })
    await user.click(background)
    expect(
      await screen.findByText('Runtimes now stay alive while NZAP is in the background.'),
    ).toBeInTheDocument()
    expect(engine.state.settings.closeToTray).toBe(true)
    // Artifacts stay in the app; the log is shared rather than opened.
    expect(screen.queryByRole('region', { name: 'Job artifacts' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Share diagnostics log' }))
    expect(engine.state.shared).toContain('nzap.log')
  })

  it('rejects a catalog URL that is not https', async () => {
    const { user, engine } = renderWithEngine(<SettingsPage />)
    const field = await screen.findByRole('textbox', { name: 'Catalog URL' })
    const before = engine.state.settings.catalogUrl
    await user.clear(field)
    await user.type(field, 'http://example.com/catalog/')
    await user.click(screen.getAllByRole('button', { name: /Save/ })[1])
    expect(await screen.findByText('The catalog URL must be an https:// address.')).toBeVisible()
    expect(engine.state.settings.catalogUrl).toBe(before)
  })
})
