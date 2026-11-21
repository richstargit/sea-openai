export function pathWithoutQuery(url: string | undefined): string {
  if (!url) return ''

  const queryIndex = url.indexOf('?')
  return queryIndex === -1 ? url : url.slice(0, queryIndex)
}
