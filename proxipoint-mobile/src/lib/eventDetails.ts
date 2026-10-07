export interface EventPicture {
  url: string;
  caption: string;
}

export interface EventDetailFields {
  summary: string;
  url: string;
  pictures: EventPicture[];
  startsAt: string;
  endsAt: string;
}

const ZONE = 'America/Denver';

const PHOTO = {
  berries:
    'https://fastly.picsum.photos/id/1080/1200/800.jpg?hmac=yjP-4DMnQX0OYkHkkV1c3ZyL10eEaSNsHDd7gfFXIAo',
  produce:
    'https://fastly.picsum.photos/id/292/1200/800.jpg?hmac=uNfmpCqKNoGxQwHcv2_NjeJ06Y021BymZfIxH_6IMYw',
  breakfast:
    'https://fastly.picsum.photos/id/493/1200/800.jpg?hmac=h_AOYMcbcuSb3WaWQFHNZKi4zVnNqUif2SRkzvDcxIE',
  pourOver:
    'https://fastly.picsum.photos/id/1060/1200/800.jpg?hmac=y5P5Dpc6T-fFVAMKtMjOs1eNV6Oa9dk1FvHbTa9CqDU',
  latte:
    'https://fastly.picsum.photos/id/431/1200/800.jpg?hmac=6jP6UOwZYe0m4ew92wpMCZ76B28I5SKTNx3-BiNyCAQ',
  tea: 'https://fastly.picsum.photos/id/225/1200/800.jpg?hmac=fT1BDQj5NOkXF7bamE8ImQwyvxjyFfGvOKVVsroEphg',
  flowers:
    'https://fastly.picsum.photos/id/106/1200/800.jpg?hmac=FtImpc9mJa1YFd5gmPvFxghkgaVJ_t4sKugu4ih_yb0',
  cookies:
    'https://fastly.picsum.photos/id/835/1200/800.jpg?hmac=Y48IVclTOeVQy6DtC60izhePHC3-0CUC8IjDnKmP4Zw',
  overlook:
    'https://fastly.picsum.photos/id/1015/1200/800.jpg?hmac=Fpx-97bpiJi8RKyXmx8pd8pdX2un_8q1Zq4WEGa6z5g',
} as const;

export const SEED_EVENT_DETAILS: Record<string, EventDetailFields> = {
  'event-1': {
    summary:
      'The Midnight Owls play a full set at The Rusty Anchor on Walnut Street. Doors open ahead of the downbeat, and the late set runs past eleven.',
    url: 'https://www.bouldercoloradousa.com/things-to-do/nightlife/',
    pictures: [
      { url: PHOTO.latte, caption: 'The bar before doors' },
      { url: PHOTO.tea, caption: 'Intermission' },
      { url: PHOTO.flowers, caption: 'Walnut Street outside' },
    ],
    startsAt: '2026-10-08T02:00:00.000Z',
    endsAt: '2026-10-08T05:00:00.000Z',
  },
  'event-2': {
    summary:
      'Trucks line Central Park for the Tuesday rally. The first window opens at five, and the line keeps moving until eight.',
    url: 'https://bouldercolorado.gov/locations/central-park',
    pictures: [
      { url: PHOTO.produce, caption: 'Prep at the trucks' },
      { url: PHOTO.cookies, caption: 'Something sweet after' },
      { url: PHOTO.latte, caption: 'Coffee while you wait' },
    ],
    startsAt: '2026-10-07T23:00:00.000Z',
    endsAt: '2026-10-08T02:00:00.000Z',
  },
  'event-3': {
    summary:
      'Monthly social for Go and Kotlin folks at Downtown Tech Lab. Short intros, then the room splits between code questions and coffee.',
    url: 'https://www.meetup.com/find/?keywords=golang%20kotlin&source=EVENTS&location=us--co--Boulder',
    pictures: [
      { url: PHOTO.pourOver, caption: 'Code and coffee' },
      { url: PHOTO.latte, caption: 'The meetup counter' },
    ],
    startsAt: '2026-10-09T00:00:00.000Z',
    endsAt: '2026-10-09T02:30:00.000Z',
  },
  'downtown-1': {
    summary:
      'Acoustic sets on the Pearl Street Mall, with players rotating from late afternoon into the evening. The circle stays open between songs.',
    url: 'https://boulderdowntown.com/events',
    pictures: [
      { url: PHOTO.flowers, caption: 'Pearl Street planters' },
      { url: PHOTO.latte, caption: 'Before the set' },
      { url: PHOTO.tea, caption: 'Between songs' },
    ],
    startsAt: '2026-10-07T23:00:00.000Z',
    endsAt: '2026-10-08T01:00:00.000Z',
  },
  'downtown-2': {
    summary:
      'The Boulder Farmers Market fills the mall with produce, bread, and flowers. Vendors pack up midafternoon.',
    url: 'https://www.bcfm.org/',
    pictures: [
      { url: PHOTO.berries, caption: 'Market berries' },
      { url: PHOTO.produce, caption: "This week's produce" },
      { url: PHOTO.breakfast, caption: 'A market breakfast' },
    ],
    startsAt: '2026-10-07T14:00:00.000Z',
    endsAt: '2026-10-07T20:00:00.000Z',
  },
  'downtown-3': {
    summary:
      'Pickup on the bandshell lawn at Central Park. A light shirt and a dark shirt are enough, and the game runs until the light drops.',
    url: 'https://bouldercolorado.gov/locations/central-park',
    pictures: [
      { url: PHOTO.overlook, caption: 'The walk over' },
      { url: PHOTO.flowers, caption: 'Park edge' },
    ],
    startsAt: '2026-10-08T00:30:00.000Z',
    endsAt: '2026-10-08T02:00:00.000Z',
  },
};

const FALLBACK_PHOTOS: EventPicture[] = [
  { url: PHOTO.overlook, caption: 'Nearby' },
  { url: PHOTO.flowers, caption: 'Around the block' },
  { url: PHOTO.latte, caption: 'Before it starts' },
];

function denverParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour'), minute: read('minute') };
}

export function zonedWindow(reference: Date, startHour: number, endHour: number): { startsAt: string; endsAt: string } {
  const day = denverParts(reference);
  const utcGuess = new Date(Date.UTC(day.year, day.month - 1, day.day, startHour, 0, 0));
  const seen = denverParts(utcGuess);
  const deltaMinutes = startHour * 60 - (seen.hour * 60 + seen.minute);
  const startsAt = new Date(utcGuess.getTime() + deltaMinutes * 60_000);
  const durationHours = endHour > startHour ? endHour - startHour : endHour + 24 - startHour;
  const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

export function formatEventSchedule(startsAt: string, endsAt: string): { dateLabel: string; timeLabel: string } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: ZONE,
  }).format(start);
  const clock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: ZONE,
  });
  const endDay = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: ZONE,
  }).format(end);
  const startDay = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: ZONE,
  }).format(start);
  const endClock = endDay === startDay ? clock.format(end) : `${endDay}, ${clock.format(end)}`;
  return { dateLabel, timeLabel: `${clock.format(start)} – ${endClock} MT` };
}

export function templateEventDetails(input: {
  id: string;
  title: string;
  venue: string;
  tag: string;
  latitude?: number;
  longitude?: number;
  reference?: Date;
}): EventDetailFields {
  const slug = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const hasPoint = Number.isFinite(input.latitude) && Number.isFinite(input.longitude);
  const url = hasPoint
    ? `https://www.google.com/maps/search/?api=1&query=${input.latitude},${input.longitude}`
    : `https://boulderdowntown.com/events/${slug || 'event'}`;
  const hash = [...input.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const first = FALLBACK_PHOTOS[hash % FALLBACK_PHOTOS.length];
  const second = FALLBACK_PHOTOS[(hash + 1) % FALLBACK_PHOTOS.length];
  const window = zonedWindow(input.reference ?? new Date('2026-10-07T18:00:00.000Z'), 18, 20);
  return {
    summary: `${input.title} at ${input.venue}. ${input.tag.replace('#', '')} listing with the time window, photos, and the event link.`,
    url,
    pictures: [
      { url: first.url, caption: input.venue },
      { url: second.url, caption: input.title },
    ],
    ...window,
  };
}
