/**
 * A small built-in filter for curse words and slurs in names people see (spot names, Drop titles,
 * #tags, descriptions). It catches common spellings and dodges ("f*ck", "sh1t", "fuuuck",
 * "f u c k") without flagging ordinary words that happen to contain one ("Scunthorpe", "class",
 * "shiitake", "Dickens"). The server should run its own check too; this is the first line.
 */

/** Matched as whole words, or as the start of a word ("fucking", "shitty"). */
const ROOTS = [
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'bastard', 'asshole', 'dickhead', 'motherf',
  'whore', 'slut', 'pussy', 'cock', 'wank', 'twat', 'bollock', 'jackass', 'dumbass', 'douche',
  'nigg', 'fagg', 'retard', 'spic', 'chink', 'kike', 'tranny', 'wetback', 'beaner', 'gook',
  'raghead', 'towelhead', 'porn', 'rapist',
];

/** Only flagged as a whole word (they start lots of ordinary words). */
const WHOLE_WORDS = ['ass', 'arse', 'dick', 'fag', 'tits', 'piss', 'dyke', 'kkk', 'wtf', 'stfu'];

/** Ordinary words that start with a root. */
const ALLOWED = [
  'cocktail', 'cockpit', 'cockatoo', 'cockatiel', 'cockroach', 'cocker', 'cockney', 'cockburn', 'cockle',
  'shitake', 'spice', 'spicy', 'spicer', 'spick', 'retardant', 'pussycat', 'pussywillow', 'chinking',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '*': 'u' };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[01!34@5$7+*]/g, (ch) => LEET[ch] ?? ch);
}

/** "fuuuck" -> "fuck", "shiiit" -> "shit". */
const squeeze = (word: string) => word.replace(/(.)\1+/g, '$1');

function wordIsOffensive(word: string): boolean {
  if (!word) return false;
  for (const form of new Set([word, squeeze(word)])) {
    if (ALLOWED.some((ok) => form.startsWith(ok))) continue;
    if (WHOLE_WORDS.includes(form)) return true;
    if (ROOTS.some((root) => form.startsWith(root))) return true;
    // "f*ck": a wildcard where a vowel goes.
    if (/^f.ck/.test(form) || /^sh.t$/.test(form) || /^b.tch/.test(form) || /^c.nt$/.test(form)) return true;
  }
  return false;
}

/** True if the text has a curse word or slur in it. */
export function containsOffensive(text: string): boolean {
  if (!text) return false;
  const words = normalize(text).split(/[^a-z*.]+/).map((w) => w.replace(/[.]/g, '')).filter(Boolean);
  if (words.some(wordIsOffensive)) return true;
  // Spaced or dotted out letter by letter: "f u c k", "s.h.i.t".
  let run = '';
  for (const word of [...words, '']) {
    if (word.length === 1) run += word;
    else {
      if (run.length >= 3 && wordIsOffensive(run)) return true;
      run = '';
    }
  }
  // Glued into a hashtag: "#FuckMondays" -> check each capitalized part of the original.
  const parts = text.match(/[A-Z][a-z0-9]+|[a-z0-9]+/g) ?? [];
  return parts.length > 1 && parts.some((part) => wordIsOffensive(squeeze(normalize(part))) || wordIsOffensive(normalize(part)));
}

export const OFFENSIVE_MESSAGE = 'That has language we don’t allow. Try different wording.';
