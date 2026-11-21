let codec: Promise<typeof import('mediabunny')> | undefined
export function videoCodecs() {
  codec ??= import('@mediabunny/server').then(
    async ({ registerMediabunnyServer }) => {
      registerMediabunnyServer()
      return import('mediabunny')
    },
  )
  return codec
}
