/**
 * Key facts of a gathered event (the server's `details`), turned into what the app shows:
 * a price chip ("From $30"), an age chip ("21+"), a notice pill ("Age 21+ only • Valid ID
 * required at door") and a one-line hook. ProxiPoint shows what's going on around you; the
 * story and the tickets stay on the source's page, linked from the details sheet.
 */

export interface ApiEventDetails {
  hook?: string;
  performers?: string[];
  price_min?: number;
  price_max?: number;
  currency?: string;
  free?: boolean;
  min_age?: number;
  all_ages?: boolean;
  doors?: string;
  notices?: string[];
}

export interface EventFacts {
  /** "Free", "$30" or "From $30"; null when the listing gives no price. */
  priceLabel: string | null;
  /** "21+", "18+" or "All ages"; null when not stated. */
  ageLabel: string | null;
  /** Door rules worth knowing before you go, most important first. */
  notices: string[];
  /** One factual line ("Featuring X, with Y. Doors 6:30 PM."). */
  hook: string;
  /** For Discover's filters (lib/discoverPrefs): lowest price (0 when free), null when not listed. */
  priceMin?: number | null;
  free?: boolean;
  /** 18 or 21 when there's an age limit. */
  minAge?: number | null;
  allAges?: boolean;
}

const NOTICE_LABELS: Record<string, string> = {
  sold_out: 'Sold out',
  id_required: 'Valid ID required at door',
  clear_bag: 'Clear bag policy',
  cashless: 'Cashless venue',
};
const NOTICE_ORDER = ['sold_out', 'age', 'id_required', 'clear_bag', 'cashless'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** "$30", "$12.50"; other currencies as "30 EUR". */
export function formatPrice(amount: number, currency = 'USD'): string {
  const cents = Math.round(amount * 100) % 100 !== 0;
  const n = cents ? amount.toFixed(2) : String(Math.round(amount));
  const code = (currency || 'USD').toUpperCase();
  return code === 'USD' ? `$${n}` : `${n} ${code}`;
}

export function priceLabel(d: ApiEventDetails): string | null {
  const lo = isNum(d.price_min) && d.price_min > 0 ? d.price_min : null;
  const hi = isNum(d.price_max) && d.price_max > 0 ? d.price_max : null;
  if (lo == null && hi == null) return d.free === true ? 'Free' : null;
  const min = lo ?? (hi as number);
  const single = lo != null && hi != null ? lo === hi : true;
  return single && lo != null && hi != null ? formatPrice(min, d.currency) : `From ${formatPrice(min, d.currency)}`;
}

/** The facts to show, or null when the server sent none. */
export function eventFacts(raw: unknown): EventFacts | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as ApiEventDetails;
  const age = d.min_age === 21 || d.min_age === 18 ? d.min_age : null;
  const codes = new Set((Array.isArray(d.notices) ? d.notices : []).filter((n) => typeof n === 'string'));
  if (age) codes.add('age');
  const notices = NOTICE_ORDER.filter((code) => codes.has(code)).map((code) =>
    code === 'age' ? `Age ${age}+ only` : NOTICE_LABELS[code],
  );
  const facts: EventFacts = {
    priceLabel: priceLabel(d),
    ageLabel: age ? `${age}+` : d.all_ages === true ? 'All ages' : null,
    notices,
    hook: typeof d.hook === 'string' ? d.hook.trim() : '',
    priceMin: isNum(d.price_min) ? d.price_min : d.free === true ? 0 : null,
    free: d.free === true,
    minAge: age,
    allAges: d.all_ages === true,
  };
  return facts.priceLabel || facts.ageLabel || facts.notices.length || facts.hook ? facts : null;
}
