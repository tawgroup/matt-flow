import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'matt-flow',
  component: 'Pane',
  requestId: 'matt-flow',
  props: {
    title: 'Matt flow',
    isFocused: false,
    bodyColumns: 50,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

// Each hook here stands for the engine beneath the mod.
const engine = (on: Parameters<TestBody>[1], opened: string[]) => {
  on('command.register', () => ({ value: { command: 'matt-flow' } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
}

const texts = async (ui: { findAll: (q: { type: 'Text' }) => Promise<readonly { text: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')

test('an empty pane points at grill', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const all = await texts(ui)
    expect(all).toContain('chưa bắt đầu')
    expect(all).toContain('/grill-with-docs')
    await ui.unmount()
  }
})

test('skills light up their phase, the latest is current, and the pane opens once', async ($, on) => {
  const opened: string[] = []
  engine(on, opened)
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })

  await $.tool.call({ tool: 'Skill', skill: 'grill-with-docs' })
  await $.tool.call({ tool: 'Skill', skill: 'anthropic-skills:handoff' })
  await $.tool.call({ tool: 'Skill', skill: 'to-spec' })
  await $.tool.call({ tool: 'Skill', skill: 'not-a-matt-skill' })
  expect(opened).toEqual(['matt-flow'])

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const all = await texts(ui)
    expect(all).toContain('bước 4/7 Spec')
    expect(all).toContain('/to-tickets')
    expect(all).toContain('grill-with-docs ×1')
    expect(all).toContain('handoff ×1')
    expect(all).toContain('bỏ qua')
    expect(all).not.toContain('not-a-matt-skill')

    await ui.press({ key: 'phase:qa' })
    expect(await texts(ui)).toContain('Con người test tay')
    await ui.press({ key: 'phase:qa' })
    expect(await texts(ui)).not.toContain('Con người test tay')
    await ui.unmount()
  }
})

test('a skill typed as a slash command counts too', async ($, on) => {
  engine(on, [])
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await $.prompt.submit({
    text: '/prototype',
    command: { name: 'prototype', args: '' },
    wait: false,
    origin: { kind: 'composer' },
  })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await texts(ui)).toContain('bước 3/7 Prototype')
  await ui.unmount()
})

test('past the dumb zone the pane says to hand off', async ($, on) => {
  engine(on, [])
  on('session.measure', (_, e) => ({ changed: e.changed }))
  await $.session.start({ cwd: '/p', surface: 'desktop', isInteractive: true })
  await $.session.measure({ context: { window: 1_000_000, tokens: 260_000 }, rateLimits: [], changed: ['context'] })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await texts(ui)).toContain('Đã vào dumb zone')
  await ui.unmount()
})
