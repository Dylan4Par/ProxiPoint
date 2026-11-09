/** A short, file-safe name for a tile URL (the style, z/x/y and scale are all in the URL). */
export function tileFileName(url: string): string {
  // FNV-1a 32-bit twice (forward and backward) for a 16-hex-digit name; plenty for tile counts.
  let a = 0x811c9dc5;
  let b = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) {
    a = Math.imul(a ^ url.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ url.charCodeAt(url.length - 1 - i), 0x01000193) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}.png`;
}
