import { describe, expect, it } from 'vitest'
import { applyModifiers } from './terminal-panel'

describe('terminal key bar modifiers', () => {
  it('turns Ctrl + a letter into its control character', () => {
    expect(applyModifiers('c', new Set(['ctrl']))).toBe('\x03')
    expect(applyModifiers('D', new Set(['ctrl']))).toBe('\x04')
    expect(applyModifiers('[', new Set(['ctrl']))).toBe('\x1b')
    expect(applyModifiers('?', new Set(['ctrl']))).toBe('\x7f')
  })

  it('prefixes Escape for Alt and leaves plain input alone', () => {
    expect(applyModifiers('b', new Set(['alt']))).toBe('\x1bb')
    expect(applyModifiers('x', new Set(['ctrl', 'alt']))).toBe('\x1b\x18')
    expect(applyModifiers('ls -la', new Set())).toBe('ls -la')
    // Ctrl only applies to a single keystroke, not pasted text.
    expect(applyModifiers('paste', new Set(['ctrl']))).toBe('paste')
  })
})
