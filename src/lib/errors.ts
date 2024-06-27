import { toast } from 'sonner'
import { z } from 'zod'

import { Platform } from '@/lib/schemas'

/* ConfigErrors */
export const ConfigErrors = z.enum([
  'BattleNetConfig',
  'BattleNetInstall',
  'SteamInstall',
  'SteamAccount'
])
export type ConfigErrors = z.infer<typeof ConfigErrors>

/* ConfigError Response Schema */
export const ConfigErrorSchema = z.object({
  error_key: ConfigErrors.or(z.enum(['NoOverwatch'])),
  message: z.string(),
  platforms: z.array(Platform)
})
export type ConfigErrorSchema = z.infer<typeof ConfigErrorSchema>

/* ConfigError Class */
export class ConfigError extends Error {
  error_key: ConfigErrorSchema['error_key']
  // error_action: ConfigErrorSchema['error_action']
  platforms: ConfigErrorSchema['platforms']

  constructor(public error: ConfigErrorSchema) {
    super(error.message)
    this.error_key = error.error_key
    // this.error_action = error.error_action
    this.platforms = error.platforms
  }
}

/* SetupError Class */
export class SetupError extends Error {
  constructor() {
    super('Failed to setup!')
  }
}

export const SetupPathResponse = z.object({
  path: z.string(),
  defaultPath: z.string()
})
export type SetupPathResponse = z.infer<typeof SetupPathResponse>

/* Handle non-critical errors */
// , reportable = true
export function handleError(error: unknown) {
  if (error instanceof Error) error = error.message
  else if (typeof error !== 'string') error = 'An unknown error occurred.'
  toast.error((error as string).replaceAll(/\[\[|\]\]/g, '"'), {
    duration: 5000
  })
  // , {
  //   action: reportable
  //     ? {
  //         label: 'Report',
  //         onClick: () => toast.dismiss() // TODO: Implement error reporting
  //       }
  //     : undefined
  // }
}

export function getReportURL(error: Error) {
  const body = encodeURIComponent(`### Error\n\n\`\`\`\n${error.stack}\n\`\`\``)
  return `https://github.com/KirillTregubov/OverBuddy/issues/new?body=${body}`
}
