# The .fm file format

A frogmouth vault is a folder with one `vault.fm` file in it. The file is UTF-8 JSON, pretty-printed so it diffs well in git and can be read or fixed in any editor. This page is the contract between frogmouth releases, and for any tool that reads or writes vaults.

## Version and compatibility

```json
{"frogmouth": 1, "saved": "2026-10-22T09:30:00.000Z", "data": { … }}
```

- **`frogmouth`** is the format version, an integer. This document describes **format 1**.
- **Additions keep the version.** A release may add fields to any object, or new kinds of blocks to note HTML, without changing the number.
- **Unknown markup in note HTML** (a kind of block or link a release does not know) shows as plain text in that release, and is dropped only if that release edits the note.
- **Unknown fields are kept.** A release that reads a field it does not know leaves it as it is and writes it back unchanged. So a vault edited by a newer release and then by an older one loses nothing the older one did not touch.
- **Only a breaking change raises the version**: removing or renaming a field, or changing what an existing field means. A release never opens a file whose `frogmouth` is higher than its own. It says so and does not touch the file, so it can never write over data it does not understand.
- **Tools that write vaults** should do the same: keep unknown fields, and refuse a higher `frogmouth`.
- A file is a vault only if it is a JSON object with an integer `frogmouth` and an object `data`. Anything else is refused, not repaired.

`saved` is when the file was written (ISO 8601, informational). Anything else at the top level is not kept; extensions go inside `data`.

## `data`

```json
{
 "notes":   [ note, … ],
 "boards":  [ board, … ],
 "secrets": [ secret, … ],
 "ui":      { … }
}
```

Every `id` is a string, unique within its list. Times are milliseconds since the Unix epoch.

### note

Notes live once, in `notes`. Boards only place them, so the same note can be on several boards or on none.

| Field | Type | |
|---|---|---|
| `id` | string | |
| `html` | string | The content, in the HTML subset below |
| `title` | string | First non-empty line of the text. Derived from `html`; rebuilt if missing |
| `text` | string | Plain text, one line per block, for search. Derived from `html`; rebuilt if missing |
| `tags` | string[] | Plain (`docs`) or key:value (`env:prod`) |
| `color` | string | `moth`, `straw`, `apricot`, `rose`, `heather`, `dusk`, `sea`, `lichen` or `night`. A name a release does not know is kept, and shown as `moth` |
| `created`, `updated` | number | |

**Note HTML** is sanitized on every load and paste. It may contain only:

- Blocks: `p` `h1` `h2` `h3` `ul` `ol` `li` `blockquote` `hr`. Todo lists are `ul data-type="todo"` with `li data-checked="true|false"`.
- Code: `pre class="code" data-lang="…"` containing one `code`, whose text is the code.
- Tables: `table` `thead` `tbody` `tr` `th` `td`. Every row has the same number of cells.
- Inline: `b` `strong` `i` `em` `u` `s` `del` `code` `mark` `br`, and `a href` with `http:`, `https:` or `mailto:` only.
- Note links: `a class="mention" data-note="<note id>"`.
- Board links: `a class="bref" data-board="<board id>"` (since 1.2). A link only points at a board; it never places anything on one.
- File tags: `span class="fref" data-path="<path in the vault folder>"`.
- Secret references: `span class="sref" data-secret="<secret id>"`. The value is never copied into the note.
- Images: `figure class="pic" data-src="<path in the vault folder>"`, optionally with `data-h` (height in pixels). The source may also be a base64 `data:image/…` URL.

Paths are relative to the vault folder, use `/`, and never contain `..` or `:`.

### board

| Field | Type | |
|---|---|---|
| `id`, `name` | string | |
| `items` | placement[] | The notes on this board |
| `pinned` | `true` | Present only when pinned |
| `shapes` | shape[] | Boxes, frames and lines drawn on this board (since 1.3). Present only when the board has at least one |
| `created`, `opened` | number | `opened` orders the board lists |

A **placement** is `{"note": id, "x": number, "y": number, "w": number, "h": number|null, "z": number}`. Positions and sizes are board units: CSS pixels at 100% zoom, with the origin at the board's top-left. They never depend on the screen. `h: null` means the note is as tall as its content. `z` orders overlapping notes.

### shape

Shapes belong to one board; unlike notes they are not shared. Every shape has an `id` (unique within the board) and a `type`:

| `type` | | Fields |
|---|---|---|
| `rect` | Rectangle with rounded corners | `x` `y` `w` `h` `z` `color` `text`, optional `fill: false`, `dash: true` |
| `ellipse` | Ellipse | as `rect` |
| `diamond` | Diamond | as `rect` |
| `text` | Free text, no outline | as `rect` |
| `frame` | A named region. Whatever is centred inside it moves with it; it stores no list of children | `x` `y` `w` `h` `color` `text` (its name), optional `dash: true` |
| `line` | A line or arrow | `a` `b` (its ends), `head`, optional `route: "elbow"`, `color`, `text` (its label), optional `dash: true` |

```json
{"id":"s1","type":"rect","x":80,"y":80,"w":160,"h":96,"z":4,"color":"sea","text":"API"}
{"id":"s2","type":"frame","x":40,"y":40,"w":480,"h":320,"color":"moth","text":"Backend"}
{"id":"s3","type":"line","a":{"shape":"s1"},"b":{"note":"n7"},"head":"end","route":"elbow","color":"moth","text":"calls"}
```

- Positions and sizes are board units, like placements. Boxes are at least 24 × 24, frames at least 80 × 60.
- `color` is one of the note colour names; `text` is plain text, never HTML.
- `z` orders boxes among the board's notes (one shared order). Frames are always drawn under notes and boxes, lines above them; neither has a `z`.
- A line end is a free point `{"x": n, "y": n}`, or attached: `{"note": id}` (a note placed on this board) or `{"shape": id}` (a box or frame on this board). An attached end has no stored position: it is drawn where the line between the two ends' centres crosses the outline, so it follows when either end moves or resizes. A line with an end that points at nothing is dropped on load.
- `head` is `none`, `end` or `both`. Without `route` a line is straight; `elbow` draws it in three straight segments.
- When a note leaves a board or a shape is deleted, the line ends attached to it become free points where they were.
- A shape whose `type` a release does not know is kept, with all its fields, and not drawn.

### secret

| Field | Type | |
|---|---|---|
| `id`, `key`, `value` | string | `value` is plain text |
| `tags` | string[] | As for notes |
| `desc` | string | |
| `created`, `updated` | number | |

### ui

Where you were: `board` (id), `active` (`b:<board id>`, `notes` or `secrets`) and `recent` (board ids, most recent first). It belongs to the vault, so it follows the file. How each board is panned and zoomed is per browser and is not in the file.

## Next to `vault.fm`

| Path | |
|---|---|
| `assets/` | Images pasted or dropped into notes |
| `files/` | Other files dropped into notes |
| `.fm-backups/` | One copy of `vault.fm` per day; the last 14 are kept |

Any other file in the folder can be tagged in a note, and is left alone.
