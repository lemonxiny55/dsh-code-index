// Reload only this acceptance module through normal profile configuration.
export const inject = ['tools', 'sessions', 'sessionPersistence']
export async function apply(ctx, config = {}) {
  const audit = await import(new URL('./desktop-audit.mjs?revision=' + (config.revision ?? 1), import.meta.url))
  if (config.restore) await audit.restore(ctx)
  else await audit.apply(ctx)
}
