# Motion Tracker Card

A Home Assistant dashboard card that shows recent motion on your own floor plans.

- Configurable vector floor plans, room names, furniture, windows and status positions.
- Latest, fresh and recent detections have separate colors and expire after a chosen time window.
- Several detectors can report into one room. Selecting the room shows its last reporting detector.
- Supports native binary sensors, timestamp entities, and event-style text helpers.
- Uses recorder history on load and refreshes while visible; current state changes update immediately.
- A history button opens Home Assistant's normal entity overlay.
- Responsive floor layout, keyboard-selectable rooms, and contrasting status badges.
- No runtime dependencies, device commands, external requests, or telemetry.

Floor geometry and sensor mappings belong in dashboard configuration. This repository contains only a fictional example, never a real home's layout or KNX addresses.

## Installation

### HACS custom repository

Add `https://github.com/felixsteghofer/home-assistant_motion-tracker-card` as a custom **Dashboard** repository in HACS, then download it. If HACS does not register the resource automatically, add:

```yaml
url: /hacsfiles/home-assistant_motion-tracker-card/motion-tracker-card.js
type: module
```

### Manual

Copy the root `motion-tracker-card.js` into `/config/www/motion-tracker-card.js` and add `/local/motion-tracker-card.js?v=0.1.0` as a JavaScript module resource under dashboard resources. Reload the frontend after installation or updates.

Add a card of type `custom:motion-tracker-card`. The visual editor offers common settings and a **Full configuration (JSON)** editor for geometry and mappings. Home Assistant's YAML card editor works too. Storage dashboards stay editable in the UI.

## Quick start

The complete copyable JSON example is [examples/basic.json](examples/basic.json). JSON is also valid in the card's YAML editor.

```yaml
type: custom:motion-tracker-card
title: Movement at home
minutes: 30
floors:
  - id: downstairs
    name: Downstairs
    view_box: [0, 0, 400, 240]
    outline: M20 20H380V220H20Z
    rooms:
      - id: living
        name: Living room
        path: M20 20H380V220H20Z
        label_position: [200, 105]
        status_position: [200, 140]
sources:
  - entity: binary_sensor.living_room_motion
    room: living
    name: Living room detector
```

Replace the example entity with one that exists in your installation. Add another source with the same `room` to combine several detectors. The most recent report wins; equal timestamps use the higher `priority`.

## Configuration

See [config.schema.json](config.schema.json) for the machine-readable schema and `src/core.js` for all defaults.

### Card and behavior

| Option | Default | Meaning |
|---|---|---|
| `title`, `subtitle`, `eyebrow` | English text | Header text; empty strings hide it. Subtitle supports `{minutes}` and `{fresh}`. |
| `minutes` | `30` | Recent detection window, 1–1440 minutes. |
| `fresh_minutes` | `5` | Fresh/recent boundary, between 0 and `minutes`. |
| `history` | `true` | Read recorder history. When false, show current and subsequently observed reports only. |
| `refresh_seconds` | `30` | Age-label refresh, minimum 5 seconds. |
| `history_refresh_seconds` | `60` | History refresh/retry interval, minimum 15 seconds. No requests while hidden or disconnected. |
| `columns` | `2` | Floor columns on wide cards, 1–4. |
| `stack_below` | `640` | Card width in pixels below which floors stack, 240–1600. |
| `time_zone` | HA timezone | Timezone for local event timestamps. Each source can override it. |
| `locale` | `en` | Locale used for timezone validation. Text translations are supplied through `labels`. |
| `history_entity` | Selected detector entity | Optional override for the normal entity overlay. |
| `show_legend`, `show_count`, `show_details`, `show_status`, `show_furniture`, `show_windows`, `show_untracked` | `true` | Independently control the displayed elements. |
| `note` | empty | Optional explanatory text below the card. |
| `grid_options`, `visibility` | HA defaults | Standard Home Assistant card options are preserved. |

All visible UI strings can be translated with `labels`: `latest`, `fresh`, `recent`, `untracked`, `quiet`, `loading`, `history_error`, `history_button`, `now`, `minutes_ago`, `hours_ago`, `room_count`, `no_events`, `no_detail`, `no_channel`. The supported substitutions are `{minutes}`, `{fresh}` and `{count}` where applicable. In `labels.fresh`, `{minutes}` is the fresh threshold.

### Floors and rooms

Each floor has a unique `id`, optional `name` and `short_name`, and `view_box: [minX, minY, width, height]`. Coordinates use that floor's SVG coordinate system, not pixels. `outline` is an optional outer SVG path. Rooms are filled first; furniture and windows are drawn over them.

Each room has:

| Option | Meaning |
|---|---|
| `id` | Stable unique ID across every floor. Data sources reference this. |
| `name` | Room name used in the detail panel. |
| `path` | SVG path for the room's footprint. |
| `label_position: [x,y]` | Position of the room name's text baseline. |
| `labels: [{text, position: [x,y]}]` | Alternative to `label_position`, for multiple labels in an open area. |
| `status_position: [x,y]` | Center of the contrasting age badge; defaults to 25 units below the first label. Keep it clear of internal walls, furniture and names. It is clamped inside the floor's viewbox. |
| `status_width`, `status_height`, `status_font_size` | Optional per-room overrides, useful for narrow rooms. Quiet rooms show a plain dash instead of an empty badge. |
| `untracked` | Optional override. By default, rooms without configured sources are marked untracked. |

To make two areas open to each other, use one continuous room path with multiple labels. Do not draw a shared internal boundary. A detector mapped to that room highlights the entire configured zone, which does not imply the person's exact position.

`furniture`, `windows`, and `decorations` are arrays of SVG shape objects. Allowed `type` values are `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`. Supply the corresponding SVG geometry attributes, such as `d`, `x`, `width`, or `points`. Optional presentation attributes are `fill`, `stroke`, `stroke-width`, `opacity`, `stroke-linecap`, `stroke-linejoin`, `stroke-dasharray`, and `transform`. Arbitrary SVG/HTML, event handlers, scripts, images and external URLs are not accepted.

### Native data sources

```yaml
sources:
  - entity: binary_sensor.hall_presence
    type: binary             # default
    room: hall
    states: ["on"]           # default
    name: Hall ceiling detector
  - entity: sensor.last_motion
    type: timestamp          # state must be an ISO timestamp with timezone
    room: hall
    name: Secondary detector
```

A `binary` source records the state's `last_changed` when its value is in `states`. A `timestamp` source reads the ISO timestamp in its state. For a timestamp attribute:

```yaml
timestamp:
  from: attribute
  attribute: last_detection
  format: iso
```

`unknown`, `unavailable`, invalid timestamps and unmapped reports are ignored. Clear/off states never count unless explicitly included in `states`. A binary sensor remaining on cannot reveal every physical movement. Its startup or recovery timestamp may also reflect restoration rather than new motion; use a persistent event timestamp when that distinction matters. Recorder retention and recording exclusions determine available history; missing history does not prove no motion.

### Event helpers and KNX

There are no built-in KNX addresses, entity IDs, room names, regular expressions or timezone assumptions. Supply them as event source configuration. For a helper containing `Hall | 2026-10-16T10:00:00+02:00`:

```yaml
sources:
  - type: event
    entity: input_text.last_motion
    room_pattern: '^([^|]+) \|'
    room_map:
      Hall: hall
      Living room: living
    timestamp:
      from: state
      format: iso
      pattern: '\| (.*)$'
```

`room_pattern` is a JavaScript regular expression; capture group `room_group` (default 1) is looked up in `room_map`. Use `detail_pattern` to capture the detector description in group 1, or `name` for a fixed description. Otherwise the helper state is shown. `priority` defaults to 0 and resolves equal-time reports from a room helper and a more detailed detector helper.

For local date strings, configure named groups and an explicit timezone:

```yaml
timestamp:
  from: state
  format: local
  pattern: '(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4}) (?<hour>\d{2}):(?<minute>\d{2}):(?<second>\d{2})$'
  time_zone: Europe/Berlin
```

Named `year`, `month`, and `day` groups are required. Time groups default to zero. Local timestamps cannot distinguish the repeated hour at the end of daylight saving time; ISO timestamps with offsets are preferable for new helpers. A raw KNX telegram is not a Home Assistant entity. Expose it via a KNX binary sensor or persist its room/detector and timestamp in a helper first.

### Colors and sizing

`colors` accepts `background`, `room`, `untracked`, `wall`, `text`, `muted`, `latest`, `fresh`, `recent`, `selected`, `status_background`, `status_text`. CSS color values and HA theme variables such as `var(--primary-color)` are supported. Background colors must suit the chosen text colors; status badges default to white with dark text.

`appearance` accepts `room_font_size` (15), `status_font_size` (12), `wall_width` (4), `outline_width` (8), `status_width` (108), `status_height` (22), `furniture_color` (`#a5ab9a`), `furniture_opacity` (0.58), and `floor_radius` (18). SVG sizes are in floor coordinates; `floor_radius` is in CSS pixels.

## Development

Requires Node.js 20 or newer. There are no npm dependencies.

```sh
npm run check
```

This runs the parsing, validation, chronology, expiry and renderer tests and rebuilds the single-file resource. Commit the generated root bundle alongside source changes. The card reads only its configured entities through the normal logged-in Home Assistant API. Tests use fictional entities and do not connect to a live instance.

Keep private floor plans, household names, sensor mappings and deployment backups outside this repository. `private/` and `*.local.json` are ignored as an additional precaution.

## License

MIT. See [LICENSE](LICENSE).
