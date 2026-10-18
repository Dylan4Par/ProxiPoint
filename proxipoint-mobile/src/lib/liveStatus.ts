/** Status text like "LIVE NOW" or "Live" means the Point is happening now (vs. "Starts in 15m"). */
export function isLiveStatus(status: unknown): boolean {
  return typeof status === 'string' && /^live\b/i.test(status.trim());
}

/** True when a Discover node is live, from its status text or an isLiveNow flag. */
export function isLiveNode(node: unknown): boolean {
  const n = node as { status?: unknown; isLiveNow?: unknown } | null;
  if (!n) return false;
  return n.isLiveNow === true || isLiveStatus(n.status);
}
