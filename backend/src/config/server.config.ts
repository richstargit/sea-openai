export function parsePort(rawValue: string | undefined): number {
  if (rawValue === undefined || rawValue.trim() === '') return 8080

  const value = rawValue.trim()
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 65535) {
    throw new Error(
      `PORT must be an integer between 1 and 65535, received "${rawValue}"`,
    )
  }

  return Number(value)
}

export function serverPort(): number {
  return parsePort(process.env.PORT)
}
