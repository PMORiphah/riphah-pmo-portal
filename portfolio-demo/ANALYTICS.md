# Demo analytics (PostHog Cloud, EU)

The demo counts anonymous usage so you can see who used it and how. It sends small batches of custom
events straight to PostHog's EU servers (`https://eu.i.posthog.com/batch/`). That is the only address
the page ever contacts. It does not load the PostHog library, so autocapture, session recordings,
heatmaps and surveys are all off by construction. No cookies are set. Person profiles are off, and
GeoIP lookup is switched off on every event.

## 1. Set up PostHog (once, about 5 minutes)

1. Sign up at **https://eu.posthog.com/signup**. Choose the **EU** region. The free tier covers 1 million events a month.
2. Create a project, for example "Capital Projects Portal demo".
3. **Settings → Project → IP data capture:** switch on **Discard client IP data**. Do this before the
   demo goes live; the privacy line on the start screen relies on it.
4. **Settings → Project → General:** copy the **Project API key**. It starts with `phc_` and is public by
   design, because it can only send events. Never use a personal API key (`phx_…`): the build refuses one.
5. Give the `phc_` key to the person building the demo. It is not stored in the repository.

## 2. Building with the key

```
DEMO_POSTHOG_KEY=phc_xxxxxxxx node portfolio-demo/build.mjs
```

The other way is to put the key in `portfolio-demo/.posthog-key`, a file git ignores. Without a key, the
demo works the same but sends nothing (local test builds).

## 3. Links with a source tag

Add `?src=` to every link you share, so the report can tell where visitors came from:

| Where you post it | Link |
|---|---|
| Upwork profile / proposals | `https://capital-projects-portal-demo.vercel.app/?src=upwork` |
| Fiverr gig | `https://capital-projects-portal-demo.vercel.app/?src=fiverr` |
| LinkedIn | `https://capital-projects-portal-demo.vercel.app/?src=linkedin` |
| A specific client | `https://capital-projects-portal-demo.vercel.app/?src=client-acme` |

Tags may use letters, numbers, `-` and `_`, up to 32 characters. You can combine a tag with a role,
for example `?src=upwork&role=guest`. That skips the start screen and opens the senior-management view.

## 4. What is recorded

Every event carries:
- an anonymous visitor id (random, kept in the visitor's browser);
- an anonymous visit id;
- the role being viewed;
- the source tag;
- the device type (phone / tablet / desktop).

Nothing typed, no names, no uploaded files.

| Event | When | Extra properties |
|---|---|---|
| `visit_start` | a new visit (per browser tab) | `referrer` (host only), `src`, `device`, `screen`, `viewport`, `language`, `visitor_new` |
| `mode_chosen` | start screen | `mode` (tour / explore), `role` |
| `tour_open` | tour started or resumed | `resume` (step) |
| `tour_step_view` | each tour step shown | `chapter`, `step`, `title` |
| `tour_jump` | a chapter chosen from Contents | `chapter` |
| `tour_complete` | the last step finished | `steps` |
| `tour_exit` | tour left early | `chapter`, `step` |
| `tab_view` | a page opened | `tab` (see the table below) |
| `project_opened` | a project opened | `project_code` (fictional) |
| `role_switch` | role changed in the bar | `from`, `to` |
| `feature_used` | filter, search, upload, export, report print, assistant question, Make it yours, currency switch, reset | `feature`, plus `control` / `type` / `tab` / `currency`… |
| `cta_click` | "Want this for your organisation?" / Upwork link | `where` (bar, bar_menu, entry, tour_end) |
| `heartbeat` | every 30 s while the tab is visible | `seconds` |

Page ids: `cmd` dashboard · `proj` projects · `camp` sites · `perf` performance · `risks` risks ·
`cashflow` cash flows · `schedule` timeline · `past` past projects · `review` proposal review ·
`inventory` inventory · `reports` monthly report · `upd` updates · `photowall` gallery · `team` team ·
`users` users · `log` activity log · `set` settings.

## 5. Your private report

The report lives inside your PostHog account, so only people you invite to that account can see it.

To open it: **eu.posthog.com → SQL editor** (left menu, "SQL"). Paste a query below, press **Run**, then
**Save as insight** and **Add to dashboard** (create one called "Demo visits"). After that, the dashboard
is one click away under **Dashboards**.

**Visits per day**
```sql
SELECT toDate(timestamp) AS day, count() AS visits, count(DISTINCT distinct_id) AS visitors
FROM events WHERE event = 'visit_start' AND timestamp > now() - INTERVAL 90 DAY
GROUP BY day ORDER BY day DESC
```

**Unique visitors (last 30 days and all time)**
```sql
SELECT count(DISTINCT if(timestamp > now() - INTERVAL 30 DAY, distinct_id, NULL)) AS last_30_days,
       count(DISTINCT distinct_id) AS all_time
FROM events WHERE event = 'visit_start'
```

**Where visitors came from**
```sql
SELECT properties.src AS source, properties.referrer AS referrer, count() AS visits, count(DISTINCT distinct_id) AS visitors
FROM events WHERE event = 'visit_start' AND timestamp > now() - INTERVAL 90 DAY
GROUP BY source, referrer ORDER BY visits DESC
```

**Tour start and completion rate**
```sql
SELECT countDistinctIf($session_id, event = 'visit_start')   AS visits,
       countDistinctIf($session_id, event = 'tour_open')     AS tours_started,
       countDistinctIf($session_id, event = 'tour_complete') AS tours_completed,
       round(100 * tours_started / nullIf(visits, 0), 1)          AS start_rate_pct,
       round(100 * tours_completed / nullIf(tours_started, 0), 1) AS completion_pct
FROM events WHERE timestamp > now() - INTERVAL 90 DAY
```
(If `$session_id` shows as unknown, use `properties.$session_id` in its place. The same applies to the queries below.)

**Tour drop-off: the furthest step each visit reached**
```sql
SELECT furthest_step, count() AS visits
FROM (SELECT $session_id AS visit, max(toInt(properties.step)) AS furthest_step
      FROM events WHERE event = 'tour_step_view' GROUP BY visit)
GROUP BY furthest_step ORDER BY furthest_step
```

**Where people left the tour**
```sql
SELECT toInt(properties.chapter) AS chapter, toInt(properties.step) AS step, count() AS exits
FROM events WHERE event = 'tour_exit' GROUP BY chapter, step ORDER BY exits DESC
```

**Most viewed pages, by role**
```sql
SELECT properties.tab AS page, properties.role AS role, count() AS views, count(DISTINCT $session_id) AS visits
FROM events WHERE event = 'tab_view' AND timestamp > now() - INTERVAL 90 DAY
GROUP BY page, role ORDER BY views DESC
```

**Features used**
```sql
SELECT properties.feature AS feature, properties.type AS detail, count() AS times
FROM events WHERE event = 'feature_used' GROUP BY feature, detail ORDER BY times DESC
```

**Average time per visit**
```sql
SELECT round(avg(seconds) / 60, 1) AS avg_minutes, round(median(seconds) / 60, 1) AS median_minutes, count() AS visits
FROM (SELECT $session_id AS visit, countIf(event = 'heartbeat') * 30 AS seconds
      FROM events WHERE event IN ('visit_start', 'heartbeat') AND timestamp > now() - INTERVAL 90 DAY GROUP BY visit)
```

**Recent visits (one row each)**
```sql
SELECT $session_id AS visit, min(timestamp) AS started,
       argMinIf(properties.src, timestamp, event = 'visit_start')    AS source,
       argMinIf(properties.device, timestamp, event = 'visit_start') AS device,
       argMinIf(properties.mode, timestamp, event = 'mode_chosen')   AS mode,
       countIf(event = 'heartbeat') * 30                             AS seconds,
       countIf(event = 'tab_view')                                   AS pages,
       maxIf(toInt(properties.step), event = 'tour_step_view')       AS tour_step,
       countIf(event = 'tour_complete') > 0                          AS finished_tour,
       countIf(event = 'cta_click')                                  AS cta_clicks
FROM events WHERE timestamp > now() - INTERVAL 30 DAY
GROUP BY visit ORDER BY started DESC LIMIT 50
```

**One visit's full timeline** (paste a `visit` id from the list above)
```sql
SELECT timestamp, event, properties.role AS role, properties.tab AS page, properties.feature AS feature,
       properties.chapter AS chapter, properties.step AS step, properties.title AS tour_step
FROM events WHERE $session_id = 'PASTE-VISIT-ID' ORDER BY timestamp
```

A visit is one browser tab. Reloads, role switches and Reset demo stay in the same visit. Opening the
demo again in a new tab, or on another day, starts a new visit by the same anonymous visitor (unless
the visitor clears their browser data).
