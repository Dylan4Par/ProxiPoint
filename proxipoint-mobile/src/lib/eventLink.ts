/**
 * The optional link on a Point (tickets, the event page, the venue's site). Typed without a
 * scheme it gets https://; only http(s) links to a real-looking host are kept.
 */
export const EVENT_URL_MAX = 300;

/** A clean https link, '' for an empty field, or null when it isn't a usable web link. */
export function normalizeEventUrl(input: string): string | null | '' {
  const raw = input.trim();
  if (!raw) return '';
  if (raw.length > EVENT_URL_MAX || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const match = /^(https?):\/\/([^/?#:]+)(:\d+)?([/?#].*)?$/i.exec(withScheme);
  if (!match) return null;
  const host = match[2].toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) || host.split('.').pop()!.length < 2) return null;
  return `${match[1].toLowerCase()}://${host}${match[3] ?? ''}${match[4] ?? ''}`;
}

/** "tickets.example.com/fall-show" for showing a link on one line. */
export function displayEventUrl(url: string): string {
  return url
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/?#]+$/, '');
}
