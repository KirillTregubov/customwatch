import { queryOptions, useMutation } from '@tanstack/react-query'
import { invoke } from '@tauri-apps/api'
import { z } from 'zod'

const LaunchConfig = z.object({
  is_setup: z.boolean(),
  battle_net_config: z.string().nullable(),
  battle_net_install: z.string().nullable()
})
type LaunchConfig = z.infer<typeof LaunchConfig>

export const launchQueryOptions = queryOptions({
  queryKey: ['launch'],
  queryFn: async () => {
    const data = await invoke('get_launch_config')
    const config = LaunchConfig.safeParse(JSON.parse(data as string))
    if (!config.success) {
      throw new Error(config.error.message)
    }
    return config.data
  }
})

const ConfigErrorSchema = z.object({
  message: z.string(),
  error_key: z.enum(['BattleNetConfig', 'BattleNetInstall'])
})
type ConfigErrorSchema = z.infer<typeof ConfigErrorSchema>

export class ConfigError extends Error {
  error_key: ConfigErrorSchema['error_key']

  constructor(public error: ConfigErrorSchema) {
    super(error.message)
    this.error_key = error.error_key
  }
}

export const useSetupMutation = ({
  onError
}: {
  onError?: (error: any) => void
}) =>
  useMutation({
    mutationFn: async () => {
      const data = await invoke('setup').catch((error) => {
        if (typeof error !== 'string') throw error

        const configError = ConfigErrorSchema.safeParse(
          JSON.parse(error as string)
        )
        if (configError.success) {
          throw new ConfigError(configError.data)
        }
      })

      const config = LaunchConfig.safeParse(JSON.parse(data as string))
      if (!config.success) {
        throw new Error(config.error.message)
      }
      return config.data
    },
    onSuccess: (data) => {
      console.log('success', data)
    },
    onError: onError
  })

export const Background = z.object({
  id: z.string(),
  image: z.string(),
  name: z.string()
})
export type Background = z.infer<typeof Background>

export const BackgroundArray = z.array(Background)
export type BackgroundArray = z.infer<typeof BackgroundArray>

export const backgroundsQueryOptions = queryOptions({
  queryKey: ['backgrounds'],
  queryFn: async () => {
    const data = await invoke('get_backgrounds')
    const backgrounds = BackgroundArray.safeParse(JSON.parse(data as string))
    if (!backgrounds.success) {
      throw new Error(backgrounds.error.message)
    }
    return backgrounds.data
  }
})

export const useBackgroundsMutation = () =>
  useMutation({
    mutationFn: (background: { id: string }) => {
      return invoke('set_background', background)
    },
    onError: (error) => {
      console.error(error)
    }
  })
