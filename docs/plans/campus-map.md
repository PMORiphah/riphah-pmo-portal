# Campus map

Status: **planned 12 Oct 2026, parked 13 Oct 2026 at the PMO's request.** Nothing built. Resume with decision 1
(drawn map vs street map), then the rest one at a time.
Planned with four research passes (campus locations, map technology, the code, the data) and three
independent designs (decision-first, design-first, lean) merged by a judge; figures re-checked by SQL.

## What it is

A third view on Campus / Sites, **Sites / Compare / Map**, for the PMO and guests (PMs never: they see only
their own projects). A drawn map in the portal's own colours (inline SVG, no tiles, no new library, no
database change, ~10 KB lazy chunk) answering two questions Compare does not show at a glance:

1. **Where the money is.** Islamabad / Rawalpindi 546.4M of 691.5M DF (79%) · Lahore 120.0M (17%) ·
   Swat 24.2M (3%) · not placed 0.9M (Hostels).
2. **Where it is still waiting for approval.** 288.6M of DF (42%) is on projects before Approved; 88% of
   it at four campuses: G-7 96.7M, I-14 71.6M, Al-Mizan 46.5M, GGC 38.6M. 218.1M has no PDD submitted
   (I-14 alone 69.7M).

Figures checked by SQL 12 Oct 2026: CAPEX DF 691,453,848; waiting 288,550,993; of which no PDD
218,084,380; released 249,118,049.

## Recommended design

- The twin cities drawn large in their real arrangement (I-14 west, G-7 and MHH north, PRH and Al-Mizan in
  Rawalpindi, GGC + Central Secretariat under one "Gulberg Greens" label, RIH south-east); Swat and Lahore
  as call-outs in their real direction ("about 150 km NNW", "about 265 km SSE", straight line), so every
  campus fits one iPhone screen. No roads, no country outline, no borders.
- Circle area = DF Recommended. Ring: **Waiting for approval** lens (default; teal fill = share of DF
  approved, label "96.7M waiting") or **Released** lens (blue fill = released % of DF, never "spent").
  Small still amber badge = planned finish passed.
- One sentence written by code above the map, e.g. "PKR 288.6M of 691.5M DF (42%) is still before
  approval; 88% of it is at G-7, I-14, Al-Mizan and GGC. 218.1M has no PDD submitted."
- Desktop: detail panel on the right (hover previews, click pins). Phone: tap fills a card under the map,
  in page flow (no overlay, no pan/zoom, the page scrolls normally).
- Detail: stage bar, projects, DF, waiting, approved, released, PDD not submitted, planned finish passed,
  open risks, no PM, deliverables, past projects open (PMO and past viewers only), the five projects
  behind the figure (tap opens the project), PMs, Open on Sites, Open in Maps (confirmed places only).
- "Not on the map" chips for any campus without a place (today Hostels); footnote with the definitions.
- Only the selected campus breathes (existing `.pmo-breathe`, off under reduced motion). Light and dark
  from the theme tokens.
- Data from Compare's own functions (`useCompareData`, `buildCampuses`, exported from
  `CampusCompare.jsx`, no logic change), so the map and Compare can never disagree.
- Places in a small table in `src/CampusMap.jsx` keyed by `campuses.id` with a name fallback.
- /preview/ first; rollback is one revert. Effort about 1.5 days to /preview/, then one review round.

Street map fallback (only if the PMO wants roads after seeing the preview): MapLibre GL + OpenFreeMap tiles,
~306 KB extra lazy JavaScript plus tiles per view, a free volunteer-run service; Leaflet + OSM not
recommended (blurry on iPhones, dark mode by filter, always draws boundaries).

## Decisions for the PMO (in order)

1. Drawn map (recommended) or a real street map?
2. What the ring shows when the map opens: Waiting for approval (recommended, Released one tap away),
   Released only, or the approved count.
3. Confirm the places below (defaults: Hostels listed, not drawn; Central Secretariat beside GGC with no
   Open in Maps until confirmed; Lahore one circle at Ferozepur Road naming QIE; Malakand drawn at Swat).
4. RMC (investment only, 190.6M): leave it off (recommended) or a hollow investment marker.
5. Motion: only the selected campus breathes (recommended), badges too, or nothing.
6. Places kept in code (recommended) or lat/lng columns on `campuses` editable by the PMO (migration shown
   first).

## Places to confirm

| Campus | Place | Lat, Lng | Confidence |
|---|---|---|---|
| Al-Mizan | 274 Peshawar Road, Rawalpindi | 33.59869, 73.04063 | high |
| G-7 | 7th Avenue, G-7/4, Islamabad | 33.70507, 73.07966 | high |
| I-14 | Near Hajj Complex, I-14/3, Islamabad | 33.61693, 72.97234 | high |
| PRH | Pakistan Railway Hospital, Westridge, Rawalpindi | 33.61914, 73.03408 | high |
| RIH | Riphah International Hospital, Sihala, Islamabad Expressway | 33.53830, 73.18613 | high |
| MHH | Max Health Hospital, G-8 Markaz, Islamabad | 33.69768, 73.04920 | high |
| GGC | Gulberg Green Campus, Block D, Gulberg Greens | 33.61361, 73.19999 | medium |
| Central Secretariat | Gulberg Greens (stand-in; building to confirm) | 33.61351, 73.20025 | low |
| Lahore | 26-M Ferozepur Road, Gulberg III (QIE campus named in its card) | 31.48863, 74.33826 | medium |
| Malakand | Kanju Township, Swat (relocation destination) | 34.82923, 72.35228 | medium |
| Hostels | male and female hostels, no source | — | none |

## Risks and limits

- Places are approximate and unconfirmed (see table); a circle shows the campus that owns a project, not
  always where the work happens (e.g. PMDC rows tagged Al-Mizan, open item 4).
- Crowding at 360 px (GGC/Central Secretariat ~30 m apart, Al-Mizan/PRH 2.35 km): hand nudges, checked at
  360, 390 and 1440 px.
- The Sites "Approved" card counts stage approved only; Compare and the map count approved or closed (PMO
  rule of 29 Sep); they differ by the 3 closed projects. Aligning the Sites card is a separate decision.
- A real iPhone can't be tested from a cloud session; the PMO checks on /preview/.
- No country outline or boundary is ever drawn (Pakistan's Surveying and Mapping (Amendment) Act 2020
  concerns unofficial maps; a point to weigh, not legal advice).

Left out on purpose: a warnings lens and ranked table (Compare has them), site-photo lens, pan/zoom and
tiles, per-project sites, RMC marker, past projects as circles, any PM view, a pin editor.
