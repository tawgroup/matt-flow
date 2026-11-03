import { atom, read, update } from 'claude-code'
import type { Hook, Register } from 'claude-code'

import type { Hit } from '../types'

type Api = Parameters<Hook<'session.start'>>[0]

const PANE = 'matt-flow'
const TITLE = 'Matt flow'
const DUMB = 250_000 // the "dumb zone": past this much context the model gets worse (Matt says ~120K; raised for 1M-context models)

// Change a tag when that value's fields change: it declines what an earlier version stored.
const hits = atom({ plugin: 'matt-flow', key: 'hits' } as const, [] as Hit[], { shape: 'hits-1' })
const ctx = atom({ plugin: 'matt-flow', key: 'ctx' } as const, null as number | null, { shape: 'ctx-1' })
const detail = atom({ plugin: 'matt-flow', key: 'detail' } as const, null as string | null, { shape: 'detail-1' })

// ---------- the flow ----------
// Matt Pocock's 7 phases of AI-driven development (video 14) with the skills of
// mattpocock/skills v1.1 (video 30) placed on them.

// `main` names the step on the map; `skills` is every skill that counts toward it.
type Phase = { id: string; n: number; name: string; optional?: true; main: string[]; skills: string[]; about: string; next: string }

const PHASES: Phase[] = [
  {
    id: 'idea', n: 1, name: 'Idea',
    main: ['wayfinder', 'grill-with-docs'],
    skills: ['grill-with-docs', 'grill-me', 'grilling', 'wayfinder', 'domain-modeling', 'ubiquitous-language', 'to-questionnaire'],
    about: 'The agent keeps asking questions until you both share the same understanding. With a codebase, use grill-with-docs. Without one, use grill-me. For a big, still-fuzzy job, use wayfinder.',
    next: 'Once it is clear: /to-spec for big work, /implement for small work. If a question needs real code or UI to answer, /handoff then /prototype.',
  },
  {
    id: 'research', n: 2, name: 'Research', optional: true,
    main: ['research'],
    skills: ['research'],
    about: 'Look up primary docs for a tricky API or service. Findings are saved to a file so later sessions need not look again.',
    next: 'Need to try it first? /prototype. Otherwise /to-spec.',
  },
  {
    id: 'prototype', n: 3, name: 'Prototype', optional: true,
    main: ['prototype'],
    skills: ['prototype'],
    about: 'Build a throwaway draft to answer one design question: what the UI looks like, whether the logic is right.',
    next: '/handoff back to the grilling session to decide, or /to-spec.',
  },
  {
    id: 'spec', n: 4, name: 'Spec',
    main: ['to-spec'],
    skills: ['to-spec', 'write-a-prd'],
    about: 'Write the destination: what the user sees, what the system does. No implementation detail yet.',
    next: '/to-tickets to split the work.',
  },
  {
    id: 'tickets', n: 5, name: 'Tickets',
    main: ['to-tickets'],
    skills: ['to-tickets', 'prd-to-issues', 'triage'],
    about: 'Split the spec into vertical-slice tickets with blocking relations. Each ticket fits one context window.',
    next: '/clear, start a fresh session, then /implement one ticket at a time.',
  },
  {
    id: 'build', n: 6, name: 'Build',
    main: ['implement', 'tdd'],
    skills: ['implement', 'implement-spec', 'tdd', 'diagnosing-bugs', 'code-review', 'pr'],
    about: 'Work ticket by ticket, tests first (red-green-refactor). implement runs type checks and tests itself, then calls code-review in a separate sub-agent.',
    next: '/qa for a human to test by hand. Every bug becomes a new ticket.',
  },
  {
    id: 'qa', n: 7, name: 'QA',
    main: ['qa'],
    skills: ['qa'],
    about: 'The agent writes the test plan. A human tests by hand. New bugs become tickets and go back to step 6.',
    next: 'Bugs left? /implement again. No bugs? Commit.',
  },
]

const SIDE = [
  'handoff', 'claude-handoff', 'improve-codebase-architecture', 'codebase-design', 'design-an-interface',
  'request-refactor-plan', 'teach', 'ask-matt', 'retro', 'wait-what', 'setup-matt-pocock-skills',
]

// ---------- helpers ----------

const norm = (name: string) => (name.split(':').pop() ?? name).trim().replace(/^\//, '').toLowerCase()
const phaseOf = (skill: string): string | null =>
  PHASES.find(p => p.skills.includes(skill))?.id ?? (SIDE.includes(skill) ? 'side' : null)
const currentOf = (list: Hit[]) => {
  const last = [...list].reverse().find(x => x.phase !== 'side')
  return PHASES.find(p => p.id === last?.phase) ?? null
}
const kTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)
const bar = (pct: number, width: number) => {
  const w = Math.max(4, width)
  const fill = Math.round((Math.min(100, Math.max(0, pct)) / 100) * w)
  return '█'.repeat(fill) + '░'.repeat(w - fill)
}
const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const label = (p: Phase) => p.main.map(s => `/${s}`).join(' · ')
const statusOf = (p: Phase | null) => (p ? `matt-flow ${p.n}/7 ${label(p)}` : undefined)
const isUp = async ($: Api) => (await $.ui.panes()).some(p => p.id === PANE)

async function record($: Api, raw: string) {
  const skill = norm(raw)
  const phase = phaseOf(skill)
  if (!phase) return
  const before = await read($, hits)
  const isFirstStep = phase !== 'side' && !before.some(x => x.phase !== 'side')
  await update($, hits, list => [...list, { skill, phase, at: Date.now() }].slice(-100))
  if (phase === 'side') return
  $.ui.status(statusOf(currentOf(await read($, hits))))
  // Open by itself once, on the first step of the flow; after that /matt-flow decides.
  if (isFirstStep && !(await isUp($))) void $.ui.open({ id: PANE, title: TITLE })
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'matt-flow',
      description: "Toggle the map of Matt Pocock's AI coding flow: where this session is, what comes next",
    })
    $.ui.status(statusOf(currentOf(await read($, hits))))
    void $.ui.open({ id: PANE, title: TITLE })
    return next(e)
  })

  on('command.run', { command: 'matt-flow' }, async $ => {
    if (await isUp($)) {
      await $.ui.close({ id: PANE })
      return { text: 'Matt flow closed.' }
    }
    await $.ui.open({ id: PANE, title: TITLE })
    const cur = currentOf(await read($, hits))
    return { text: cur ? `Matt flow: step ${cur.n}/7 ${label(cur)}.` : 'Matt flow opened.' }
  })

  // A skill the model loads goes through the Skill tool.
  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && ran.isError !== true && e.skill) await record($, e.skill).catch(() => undefined)
    return ran
  }).catch(($, e, next) => next(e)) // never block a skill: replay what next settled to, or run it

  // A skill the person types (/grill-me) arrives as a slash command.
  on('prompt.submit', async ($, e, next) => {
    const ran = await next(e)
    if (e.command && !('drop' in ran)) await record($, e.command.name).catch(() => undefined)
    return ran
  }).catch(($, e, next) => next(e)) // never block a prompt

  on('session.measure', async ($, e, next) => {
    const t = e.context.tokens
    if (t != null) await update($, ctx, () => t)
    return next(e)
  })

  // ---------- pane ----------

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const cols = e.props.bodyColumns || e.viewport?.columns || 40
    const [list, tokens, open] = await Promise.all([read($, hits), read($, ctx), read($, detail)])
    const cur = currentOf(list)
    const curIdx = cur ? PHASES.indexOf(cur) : -1
    const counts = (names: string[]) =>
      names
        .map(s => [s, list.filter(x => x.skill === s).length] as const)
        .filter(([, n]) => n > 0)
        .map(([s, n]) => `${s} ×${n}`)
        .join(' · ')

    const rows: ReturnType<typeof h>[] = []
    PHASES.forEach((p, i) => {
      const used = counts(p.skills)
      const isCur = cur?.id === p.id
      const isDone = used !== ''
      const isSkipped = !isDone && curIdx > i
      const mark = isCur ? '▶' : isDone ? '✓' : isSkipped ? '·' : '○'
      const color = isCur ? 'cyan' : isDone ? 'green' : undefined
      const title = (
        <Button plain key={`phase:${p.id}`} onPress={() => void update($, detail, d => (d === p.id ? null : p.id))}>
          <Text color={color} bold={isCur} dimColor={!isCur && !isDone}>{mark} {p.n}. {label(p)}</Text>
          <Text dimColor> {p.name}{p.optional ? ' (optional)' : ''}{isSkipped ? ' · skipped' : ''}</Text>
        </Button>
      )
      const more = open === p.id && (
        <Box flexDirection="column" paddingLeft={2}>
          <Text dimColor>{p.about}</Text>
          <Text dimColor>Also counts: {p.skills.filter(s => !p.main.includes(s)).map(s => `/${s}`).join(' ') || 'none'}</Text>
        </Box>
      )
      if (isCur) {
        rows.push(
          <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
            {title}
            {used !== '' && <Text color="green">  {used}</Text>}
            <Text>  <Text bold>Next:</Text> {p.next}</Text>
            {more}
          </Box>,
        )
      } else {
        rows.push(
          <Box flexDirection="column" paddingX={2}>
            {title}
            {isDone && <Text dimColor>  {used}</Text>}
            {more}
          </Box>,
        )
      }
      if (i < PHASES.length - 1) rows.push(<Text dimColor>    │</Text>)
    })

    const side = counts(SIDE)
    const barW = Math.max(6, Math.min(24, cols - 26))
    const pct = tokens == null ? 0 : (tokens / DUMB) * 100

    return (
      <Box flexDirection="column">
        <Text>
          <Text bold color="magenta">Matt flow</Text>
          <Text dimColor> · {cur ? `step ${cur.n}/7 ${label(cur)}` : 'not started'}</Text>
        </Text>
        {tokens != null && (
          <Text>
            ctx <Text color={pct >= 100 ? 'red' : pct >= 75 ? 'yellow' : 'green'}>{bar(pct, barW)}</Text>
            <Text dimColor> {kTok(tokens)} / {kTok(DUMB)} dumb zone</Text>
          </Text>
        )}
        {tokens != null && tokens >= DUMB && (
          <Text color="red">In the dumb zone. Time to /handoff, or /to-spec then /clear.</Text>
        )}
        {!cur && (
          <Text dimColor>No Matt skill has run yet. For a big, fuzzy job, start with /wayfinder. With a codebase, /grill-with-docs; without one, /grill-me.</Text>
        )}
        <Text dimColor>Click a step to see what it does.</Text>
        <Text> </Text>
        {rows}
        <Text dimColor>    ↺ bugs from QA go back to step 6</Text>
        <Text> </Text>
        <Text bold color="cyan">Side tools</Text>
        {side !== '' ? <Text>{side}</Text> : <Text dimColor>/handoff when context is full or a side task comes up.</Text>}
        {list.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text bold color="cyan">Recent</Text>
            {list.slice(-5).reverse().map(x => (
              <Text>
                <Text dimColor>{clock(x.at)} </Text>/{x.skill}
                <Text dimColor> · {x.phase === 'side' ? 'side tool' : `step ${PHASES.find(p => p.id === x.phase)?.n}`}</Text>
              </Text>
            ))}
          </Box>
        )}
      </Box>
    )
  })
}
