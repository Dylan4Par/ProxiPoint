# Discover feed layout handoff

Paste this prompt to another agent. Rebuild the bottom feed drawer shown in `reference.png` in this folder. Match the structure, type, color, and spacing below. Do not invent a second visual system.

Phone frame: 390×844. The drawer is the bottom sheet over a dark map. This handoff covers the sheet only.

## Reference

`reference.png` shows three stacked pieces:

1. A collapsed peek row for the selected event.
2. A `LIVE NOW` section whose first card is selected.
3. A `TOMORROW — SATURDAY, OCT 10` section with one scheduled card.

## Screen chrome around the drawer

The sheet sits at the bottom of a full-bleed screen.

- Page background `#070b13`.
- Sheet background `#090f1d`.
- Top corners 28px. Top hairline `#1e293b`.
- Expanded height 420. Collapsed height 72.
- Drag the handle, or tap the peek row, to toggle. A downward flick over 30px collapses. An upward flick expands. Spring: friction 8, tension 50.
- Horizontal inset of the list is 16.

## Peek row

Centered pull bar: 42×4, radius 2, `#334155`, 8px under the top padding.

Row, gap 10, vertically centered:

- Channel tile, 36×36. For `#LiveMusic`: music note, accent `#22d3ee`, fill `rgba(34, 211, 238, 0.14)`, border `rgba(34, 211, 238, 0.5)`, radius 32% of the tile (about 12).
- Tag, uppercase, 10px, weight 700, letter-spacing 0.4, color = channel accent. Example: `#LIVEMUSIC`.
- Title under the tag, 13px, weight 700, `#f8fafc`, one line. Example: `Pearl Street Live Music Night`.
- If the selected event is live, a 7px green pulsing dot (`#10b981`) to the right of the title.
- Chevron at the far right: `▾` when expanded, `▴` when collapsed. 18px, weight 700, `#94a3b8`.

## Section header

`LIVE NOW`

- 7px pulsing green dot, then the label.
- Label 11px, weight 800, letter-spacing 1.1, `#6ee7b7`.
- 1px rule under the label, `#1e293b`.

Scheduled days

- 7×7 rounded square tick, fill `#334155`, border `#64748b`, in place of the pulse.
- Label 11px, weight 800, letter-spacing 1.1, `#94a3b8`.
- Same 1px rule.
- Title format: `TODAY — WEEKDAY, MON D`, `TOMORROW — WEEKDAY, MON D`, otherwise `WEEKDAY, MON D`. Weekday and month are uppercase. Example: `TOMORROW — SATURDAY, OCT 10`.

## Event card

Horizontal row, vertically centered, gap 12.

- Surface `#0f172a`.
- Radius 16. Padding 14. Margin below 10.
- Hairline 1px `#1e293b`.
- Selected card: border `#22d3ee`, surface `#0b1629`.
- Soft shadow: `#020617`, offset y 6, opacity 0.28, radius 10.

Left: channel tile, 44×44, same color rules as the peek tile, radius about 14. Icon is ~48% of the tile, stroke 2.25.

Center column, flex 1, can shrink:

1. Channel tag. Uppercase, 10px, weight 800, letter-spacing 0.4, color = channel accent. 2px under it.
2. Title. `#f8fafc`, 14px, weight 700, line-height 18, up to 2 lines.
3. Host callsign. `#e2e8f0`, 11px, weight 700, 3px above.
4. Trust badge, only when the host qualifies. Pill, align start, up to 2 lines so the percent and drop count stay visible. Text `#facc15`, 9px, weight 800. Fill `rgba(34, 211, 238, 0.12)`. Border `rgba(250, 204, 21, 0.55)`. Radius 999. Padding 6×2. 4px above the callsign.
5. Venue line. `#64748b`, 11px, 3px above. Pattern: `{venue} · {count} going`.

Right column, min width 72, end-aligned:

- Live cards: 7px pulsing green dot, then meta in `#6ee7b7`, 12px, weight 700. Meta is `{distance}m away`.
- Scheduled cards: no dot (keep an 18px spacer so the time lines up), meta in `#cbd5e1`. Meta is local `HH:MM`.
- RSVP chip under the meta, 4px gap. Pill, padding 8×3, radius 999, 1px border.
  - Idle: label `RSVP`, text `#94a3b8`, border `#1e293b`, fill `#020617`.
  - Active: label `RSVP'd`, text `#22d3ee`, border `rgba(34, 211, 238, 0.55)`, fill `rgba(34, 211, 238, 0.12)`.
  - Label 10px, weight 800, letter-spacing 0.3.

The RSVP control is a sibling of the card hit target, not nested inside it.

## Channel colors

Strip `#`, case, spaces, `_`, and `-` before matching.

| Tags | Icon | Accent |
| --- | --- | --- |
| `#LiveMusic`, `#Music` | music note | `#22d3ee` |
| `#TechMeetup`, `#PostGIS` | terminal | `#38bdf8` |
| `#FoodAndDrink`, `#FoodTrucks` | flame | `#f59e0b` |
| `#FarmersMarket` | utensils | `#f59e0b` |
| `#Fitness`, `#Pickleball` | standing person | `#34d399` |
| `#Outdoor` | compass | `#34d399` |
| anything else | radio beacon | `#94a3b8`, border `#1e293b` |

Tinted fills are the accent at about 14% opacity. Borders are the accent at about 50% opacity, except the slate fallback.

## Feed order

- Live if status matches `/live now/i`, or `startsAt` is earlier today.
- Live section first, nearest distance first.
- Then one section per calendar day, soonest day first. Inside a day, sort by start time.
- Live meta is distance. Scheduled meta is the clock.

## Trust badge

Show the badge only when drops ≥ 5 and upvotes / drops ≥ 0.85.

Label: `⭐ Verified Coordinator ({percent}% • {drops} drops)`

Percent is the ratio rounded to a whole number. 45/48 is 94. 46/48 is 96. 5/5 is 100.

## Cards in the reference

```json
[
  {
    "id": "event-1",
    "tag": "#LiveMusic",
    "title": "Pearl Street Live Music Night",
    "venue": "Pearl Street Mall",
    "hostCallsign": "Viper-2",
    "hostDrops": 48,
    "hostUpvotes": 46,
    "isVerifiedCoordinator": true,
    "attendeeCount": 45,
    "distanceMeters": 180,
    "status": "LIVE NOW",
    "startsAt": "earlier today",
    "isRsvpd": false,
    "selected": true
  },
  {
    "id": "event-4",
    "tag": "#FarmersMarket",
    "title": "Farmers Market Tasting",
    "venue": "Boulder County Farmers Market",
    "hostCallsign": "Lark-9",
    "hostDrops": 5,
    "hostUpvotes": 5,
    "isVerifiedCoordinator": true,
    "attendeeCount": 64,
    "status": "Scheduled",
    "startsAt": "tomorrow 09:00 local",
    "isRsvpd": false,
    "selected": false
  }
]
```

Rendered meta: Pearl Street shows `180m away` and an idle `RSVP`. Farmers Market shows `09:00` and an idle `RSVP`.

## Source in ProxiPoint

If the other agent has this repo, read these instead of re-deriving the rules:

- `proxipoint-mobile/src/components/discovery/EventCardList.tsx`
- `proxipoint-mobile/src/components/discovery/ChannelBadge.tsx`
- `proxipoint-mobile/src/components/discovery/PulsingDot.tsx`
- `proxipoint-mobile/src/lib/feedSections.ts`
- `proxipoint-mobile/src/lib/tagIcons.ts`
- `proxipoint-mobile/src/lib/trust.ts`
