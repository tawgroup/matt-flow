export type Hit = { skill: string; phase: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'matt-flow': {
      hits: Shaped<Hit[]>
      ctx: Shaped<number | null>
      detail: Shaped<string | null>
    }
  }
}
