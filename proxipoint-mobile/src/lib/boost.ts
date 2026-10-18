import { useEffect, useState } from 'react';

/**
 * Boosts: a paid 4-hour spotlight for a Point. While boosted, the Point gets a gold pin with a
 * bolt on the Discover map, a BOOSTED tag on its card, and is listed first.
 *
 * Kept in memory for now, and the payment step is a stand-in (test mode: nothing is charged).
 * Real payments later, e.g. with Stripe (@stripe/stripe-react-native):
 *   1. App:    POST /points/:id/boosts             → server creates a PaymentIntent
 *                                                     (capture_method: 'manual'), returns its client secret
 *   2. App:    initPaymentSheet + presentPaymentSheet with that secret (card, Google Pay, Apple Pay)
 *   3. Server: on payment_intent.amount_capturable_updated, capture it and start the boost
 *              (startsAt = now, endsAt = now + 4h), then tell nearby clients over the socket
 *   GET /boosts/active                              → which Points are boosted right now
 * The server must decide the price and the boost window; never trust either from the app.
 */

export const BOOST_HOURS = 4;
/** Placeholder price until pricing is decided (in cents, USD). */
export const BOOST_PRICE_CENTS = 499;
export const BOOST_CURRENCY = 'USD';
/** True while payments are the stand-in below. Shows a "Test mode" note in the checkout. */
export const BOOST_TEST_MODE = true;

export interface Boost {
  pointId: string;
  startedAt: string;
  endsAt: string;
  /** Payment reference from the authorization (e.g. a Stripe PaymentIntent id). */
  paymentId: string;
  amountCents: number;
}

const HOUR = 60 * 60 * 1000;

let boosts = new Map<string, Boost>();
const listeners = new Set<() => void>();

function changed() {
  listeners.forEach((listener) => listener());
}

export function formatBoostPrice(cents = BOOST_PRICE_CENTS): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** The boost on this Point if it's still running. */
export function activeBoost(pointId: string | null | undefined, now = Date.now()): Boost | null {
  if (!pointId) return null;
  const boost = boosts.get(String(pointId));
  return boost && new Date(boost.endsAt).getTime() > now ? boost : null;
}

export function isBoosted(pointId: string | null | undefined, now = Date.now()): boolean {
  return activeBoost(pointId, now) != null;
}

/**
 * When a boost bought now would end: 4 hours from now, or earlier if the Point ends first
 * (a boost never outlasts its Point).
 */
export function boostWindow(pointEndsAt?: string | null, now = Date.now()): { startsAt: Date; endsAt: Date; cutShort: boolean } {
  const full = now + BOOST_HOURS * HOUR;
  const pointEnd = pointEndsAt ? new Date(pointEndsAt).getTime() : Number.NaN;
  const cutShort = Number.isFinite(pointEnd) && pointEnd < full;
  return { startsAt: new Date(now), endsAt: new Date(cutShort ? pointEnd : full), cutShort };
}

/**
 * Stand-in for the payment authorization. Resolves with a payment reference after a short
 * "processing" pause. Replace with the PaymentSheet flow described at the top of this file.
 */
export async function authorizeBoostPayment(pointId: string): Promise<{ paymentId: string; amountCents: number }> {
  await new Promise((resolve) => setTimeout(resolve, 1400));
  return { paymentId: `test_pi_${pointId}_${Date.now().toString(36)}`, amountCents: BOOST_PRICE_CENTS };
}

/** Every boost still running. */
export function getActiveBoosts(now = Date.now()): Boost[] {
  return [...boosts.values()].filter((boost) => new Date(boost.endsAt).getTime() > now);
}

/** Turn the boost on after the payment is authorized. */
export function startBoost(
  pointId: string,
  payment: { paymentId: string; amountCents: number },
  pointEndsAt?: string | null,
): Boost {
  const { startsAt, endsAt } = boostWindow(pointEndsAt);
  const boost: Boost = {
    pointId,
    startedAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    paymentId: payment.paymentId,
    amountCents: payment.amountCents,
  };
  boosts = new Map(boosts).set(pointId, boost);
  changed();
  return boost;
}

/** "3h 41m", "18m", "<1m" */
export function formatTimeLeft(endsAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 60000));
  if (minutes < 1) return '<1m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}m`;
}

/**
 * Re-renders the caller when a boost starts, and every 30 seconds so countdowns move and
 * expired boosts drop off the map. Returns the current time to compare against.
 */
export function useBoosts(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const listener = () => setNow(Date.now());
    listeners.add(listener);
    const timer = setInterval(listener, 30 * 1000);
    return () => {
      listeners.delete(listener);
      clearInterval(timer);
    };
  }, []);
  return now;
}

// Samples: a few seeded Points are already boosted by their hosts (with different amounts of
// time left) so the map, the cards and the Recommendations deck show boosts straight away.
// Remove once boosts come from GET /boosts/active.
const SAMPLE_BOOSTS: Array<{ pointId: string; minutesLeft: number }> = [
  { pointId: 'pt-taco-rally', minutesLeft: 155 },
  { pointId: 'pt-midnight-owls', minutesLeft: 210 },
  { pointId: 'pt-farmers-market', minutesLeft: 95 },
  { pointId: 'pt-pub-trivia', minutesLeft: 232 },
  { pointId: 'pt-sunset-pickleball', minutesLeft: 48 },
];
SAMPLE_BOOSTS.forEach(({ pointId, minutesLeft }) => {
  const endsAt = Date.now() + minutesLeft * 60 * 1000;
  boosts.set(pointId, {
    pointId,
    startedAt: new Date(endsAt - BOOST_HOURS * HOUR).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    paymentId: 'sample',
    amountCents: BOOST_PRICE_CENTS,
  });
});
