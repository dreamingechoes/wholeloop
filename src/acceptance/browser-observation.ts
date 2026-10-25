import { AcceptanceError } from './contracts.js'

export function browserPage(text: string, origin: string) {
  const urls = [...text.matchAll(/^- Page URL: (\S+)\s*$/gm)]
  const fenced = [...text.matchAll(/```yaml\n([\s\S]*?)\n```/g)]
  if (
    urls.length !== 1 ||
    fenced.length !== 1 ||
    /\[truncated\]|snapshot (?:truncated|incomplete)/i.test(text)
  )
    throw new AcceptanceError('browser-snapshot-incomplete')
  let url: URL
  try {
    url = new URL(urls[0]?.[1] ?? '')
  } catch {
    throw new AcceptanceError('browser-url-unobserved')
  }
  if (url.origin !== origin || url.username || url.password)
    throw new AcceptanceError('browser-wrong-origin')
  const snapshot = fenced[0]?.[1] ?? ''
  if (!snapshot.trim() || snapshot.split('\n').length > 10000)
    throw new AcceptanceError('browser-snapshot-incomplete')
  return { url: url.href, snapshot }
}
export function browserTarget(snapshot: string, target: { role: string; name: string }) {
  const found: string[] = []
  for (const line of snapshot.split('\n')) {
    const match = /^\s*- ([a-z][a-z0-9-]*) ("(?:[^"\\]|\\.)*").*?\[ref=(e\d+)\]/.exec(line)
    if (!match) continue
    let name: unknown
    try {
      name = JSON.parse(match[2] ?? '')
    } catch {
      continue
    }
    if (match[1] === target.role && name === target.name && match[3]) found.push(match[3])
  }
  if (found.length !== 1) throw new AcceptanceError('browser-target-missing-or-ambiguous')
  return found[0] ?? ''
}
export function browserTabs(text: string, origin: string) {
  const rows = text.split('\n').filter((line) => /^- \d+:/.test(line))
  const match = /^- 0: \(current\) \[.*\]\((\S+)\)$/.exec(rows[0] ?? '')
  if (rows.length !== 1 || !match?.[1]) throw new AcceptanceError('browser-context-unobserved')
  let url: URL
  try {
    url = new URL(match[1])
  } catch {
    throw new AcceptanceError('browser-context-unobserved')
  }
  if (url.origin !== origin || url.username || url.password)
    throw new AcceptanceError('browser-wrong-origin')
  return url.href
}
export function browserPng(data: string, mimeType: string) {
  if (mimeType !== 'image/png' || data.length > Math.ceil((20 * 1024 * 1024) / 3) * 4)
    throw new AcceptanceError('browser-capture-unavailable-or-oversized')
  const bytes = Buffer.from(data, 'base64')
  if (
    bytes.toString('base64') !== data ||
    bytes.length < 45 ||
    !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.subarray(12, 16).toString('ascii') !== 'IHDR' ||
    !bytes.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))
  )
    throw new AcceptanceError('browser-capture-incomplete')
  // Validate every chunk, not just the signature and trailer: a cut IDAT body
  // followed by an intact IEND is still an incomplete capture.
  let offset = 8,
    image = false,
    header = false
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) throw new AcceptanceError('browser-capture-incomplete')
    const length = bytes.readUInt32BE(offset),
      end = offset + 12 + length
    if (end > bytes.length) throw new AcceptanceError('browser-capture-incomplete')
    const kind = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    if (
      !/^[A-Za-z]{4}$/.test(kind) ||
      (!header && (kind !== 'IHDR' || length !== 13)) ||
      (header && kind === 'IHDR')
    )
      throw new AcceptanceError('browser-capture-incomplete')
    let crc = 0xffffffff
    for (const byte of bytes.subarray(offset + 4, end - 4)) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    if ((crc ^ 0xffffffff) >>> 0 !== bytes.readUInt32BE(end - 4))
      throw new AcceptanceError('browser-capture-incomplete')
    header = true
    if (kind === 'IDAT' && length) image = true
    if (kind === 'IEND' && (length || end !== bytes.length || !image))
      throw new AcceptanceError('browser-capture-incomplete')
    offset = end
  }
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20)
  if (!width || !height || width > 16384 || height > 16384)
    throw new AcceptanceError('browser-capture-dimensions')
  return { bytes, width, height }
}
