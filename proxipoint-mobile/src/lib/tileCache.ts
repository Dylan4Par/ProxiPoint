import { Directory, File, Paths } from 'expo-file-system';
import { tileFileName } from './tileFileName';

/**
 * Map tiles saved on the phone (the app's cache folder), so a tile is downloaded once and then
 * drawn from the file: panning back, zooming in and out, and reopening the map don't fetch it
 * again (each fetch costs Stadia credits). React Native's own image cache is small on Android
 * and ignores `cache: 'force-cache'`, so tiles were being downloaded over and over.
 *
 * - Kept up to MAX_AGE_MS (then the folder starts fresh), and at most MAX_FILES tiles.
 * - At most CONCURRENT downloads at once; the rest wait in line, the newest view's tiles first.
 * - The phone can also clear the cache folder when it's short of space; tiles just download again.
 */

const MAX_AGE_MS = 3 * 24 * 3600 * 1000; // a few days: fresh enough for map edits
const MAX_FILES = 4000; // ~200 MB at most at @2x; usually far less
const CONCURRENT = 8;

let dir: Directory | null = null;
let fileCount = 0;

/** The tile folder, created (and emptied when stale or too big) on first use. */
function tileDir(): Directory | null {
  if (dir) return dir;
  try {
    const root = new Directory(Paths.cache, 'map-tiles');
    const stamp = new File(root, '.created');
    const born = root.exists && stamp.exists ? Number(stamp.textSync()) : NaN;
    const stale = !Number.isFinite(born) || Date.now() - born > MAX_AGE_MS;
    const count = root.exists ? root.list().length : 0;
    if (root.exists && (stale || count > MAX_FILES)) root.delete();
    if (!root.exists) {
      root.create({ intermediates: true });
      stamp.create();
      stamp.write(String(Date.now()));
      fileCount = 0;
    } else {
      fileCount = count;
    }
    dir = root;
    return dir;
  } catch {
    return null; // no file access: callers fall back to the web address
  }
}

/** The saved file's URI if this tile is already on the phone (checked without waiting). */
export function cachedTileUri(url: string): string | null {
  const d = tileDir();
  if (!d) return null;
  try {
    const file = new File(d, tileFileName(url));
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

const inFlight = new Map<string, Promise<string | null>>();
const queue: Array<() => void> = [];
let running = 0;

function next() {
  while (running < CONCURRENT && queue.length) {
    running += 1;
    queue.shift()!();
  }
}

/**
 * The tile's file URI, downloading it first if needed (one download per URL, however many maps
 * ask). null when it can't be saved: show the web address instead.
 */
export function loadTile(url: string, urgent = false): Promise<string | null> {
  const ready = cachedTileUri(url);
  if (ready) return Promise.resolve(ready);
  const d = tileDir();
  if (!d) return Promise.resolve(null);
  const pending = inFlight.get(url);
  if (pending) return pending;
  const job = new Promise<string | null>((resolve) => {
    // Tiles for the view you're on now jump the line ahead of older requests.
    const enqueue = urgent ? queue.unshift.bind(queue) : queue.push.bind(queue);
    enqueue(async () => {
      try {
        const file = new File(d, tileFileName(url));
        const saved = await File.downloadFileAsync(url, file, { idempotent: true });
        fileCount += 1;
        resolve(saved.uri);
      } catch {
        resolve(null);
      } finally {
        running -= 1;
        inFlight.delete(url);
        next();
      }
    });
    next();
  });
  inFlight.set(url, job);
  return job;
}

/** Drops a saved tile that wouldn't draw (e.g. an error page saved instead of an image). */
export function forgetTile(url: string): void {
  const d = tileDir();
  if (!d) return;
  try {
    const file = new File(d, tileFileName(url));
    if (file.exists) file.delete();
  } catch {
    // nothing to do
  }
}

/** Tiles saved this run plus those found at start (for a quick look while testing). */
export const tileCacheCount = () => fileCount;
