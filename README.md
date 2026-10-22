<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/frogmouth-stacked-on-dark.svg">
    <img src="docs/brand/frogmouth-stacked-on-light.svg" width="300" alt="frogmouth: a head-on tawny frogmouth above the wordmark, whose two o's are its sage-green eyes">
  </picture>
</h1>

<p align="center">Sticky notes and secrets in one file on your disk.<br>One HTML page, no server, no network, no accounts.</p>

The tawny frogmouth is a nocturnal bird that hides in plain sight by posing as a broken branch, calm and watchful while it does. In the app its sage-green eyes follow your cursor, and they close while you type a secret. Logo files and usage notes are in [docs/brand](docs/brand/).

## Use it

1. Download `frogmouth.html` and open it in Chrome, Edge, Brave or Arc. Opening it straight from disk (`file://`) works.
2. Click **Open a folder** and pick (or create) a folder for your vault.
3. frogmouth creates `vault.fm` in that folder and saves to it as you type.

Firefox and Safari cannot write to folders on disk. There you can use **Try it without saving** and **Import a .fm file**, and download the vault with `⌘S`.

## What it does

**Boards of sticky notes**
- The notes get the whole window. Only a few controls float over it: the logo (its menu holds theme, export and shortcuts), a three-way switch (board, all notes, secrets), the board pills, search, and the sync icon.
- Boards are floating pills. Click one to open it, double-click to rename it in place, drag to reorder, hover for × to delete (undoable). **+** adds a board.
- **The Boards panel** (the board-count button next to the pills, or `⌥J`) lists every board with its note count and when you last opened it. Type to find one, `↵` to open it, or type a new name to create it. `⌥P` pins, `F2` renames, `⌘⇧⌫` deletes (its notes stay in All notes).
- With many boards, **pinned boards always keep a pill**; your most recently used boards fill the rest (six in all). `⌥1`–`⌥9` jump to the pills, and `⌘K` then `#` searches boards too.
- **Notes are shared, boards are views.** Every note lives in one library (the All notes page); a board only places notes on it. The same note can sit on several boards (its foot then says "2 boards"), and editing it anywhere edits it everywhere.
- **Deleting a board never deletes notes.** They stay in All notes (marked *on no board* if that was their only board) and on any other boards.
- On a board, `Del` or × **removes the note from that board** only, after a confirming second press or click (the × turns red). `⇧Del` (or ⇧-click ×) deletes the note everywhere after a confirmation dialog. Both can be undone.
- **Add an existing note** to a board with the **+** button → **Add an existing note…** (bottom right, next to the zoom) or `A`: find it by title and it lands in the middle of the screen. On the All notes page, **+** next to the boards (or `a`) puts a note on another board.
- Click a note to select it and drag it from anywhere to move it. Double-click (or `↵`) to edit, with the caret where you clicked. `Esc` stops editing.
- Resize from any edge or corner; dragging the left or top edge keeps the opposite edge exactly where it is. Double-click a bottom edge for automatic height. Pick from nine paper colours with `1`–`9`, or the colour dot at the top left of a note, which opens a small picker. Each one is a light and a dark pair that switches with the theme: soft pastels by day, deep muted tints at night, the same hue in both.
- **Work on several notes at once.** `⇧`-click adds a note to the selection, `⇧`-drag on empty board draws a box around notes, and `⌘A` selects them all. Drag any selected note to move the group; arrows nudge, `1`–`9` colour, `⌘D` duplicates and `Del` `Del` removes them all, with one undo.
- **Find on a board** with `⌘F`: every match in every note, counted ("2 of 9 in 4 notes"). Notes without a match fade back, `↵` / `⇧↵` step through the matches, and long notes and wide code blocks scroll to each one. The notes themselves are never changed. On the All notes and Secrets pages `⌘F` jumps to their filter.
- Pan with the wheel, space-drag or a drag on empty board. Zoom with `⌘`+wheel or a pinch.
- **The board is unlimited**: notes can sit anywhere and you can pan forever; zoom goes from 20% to 250%. Bottom right, a **zoom control** shows the zoom (`−` `100%` `+`; click the percentage for 100%) with **Fit**, and a **minimap** shows every note in its colour and the visible area as a frame. Click or drag in the minimap to move there; `M` hides or shows it.
- **Screens come and go; notes stay put.** Note positions are board coordinates, never screen pixels, and the view remembers which point of the board is in the middle of the window. Plug in a big display, unplug it, resize the window or change the browser zoom: the same notes stay centred, nothing moves, and going back to a size gives back exactly the view you had there. **Arrange notes** gives the same layout on any screen.
- **Arrange notes** tidies a board into columns. **Fit** shows everything at once.
- The first line of a note is its title. Nothing else is needed.

**The editor**
- `/` opens the block menu: headings, lists, todos, code, quote, divider, image, file tag, note link, secret reference and date.
- Markdown shortcuts: `# `, `## `, `- `, `1. `, `[] `, `> `, `---`, ```` ```lang ````, and `` `inline code` ``.
- **Tables**: `/table` (or `/table 4x3` for 4 columns, 3 rows). `Tab` goes to the next cell and adds a row at the end, `↵` goes to the cell below, `⇧↵` breaks a line inside a cell and `⌘↵` leaves the table. Type `/` in a cell to add or delete rows and columns. Tables pasted from a spreadsheet or a web page come in as plain grids, and table text is searchable.
- `@` links another note, **a board** (`@@` lists boards only) **or tags any file in the vault folder**, such as `diagram.excalidraw`. Clicking a file tag opens the file, saves a copy, or copies its path.
- Notes that link to a note are listed at its foot: a link icon with the count (`L` opens the list).
- **Clicking a note link opens that note right where you are**, full size over the board (the note view); you never leave your board unless you ask to. It opens for reading: click the text to edit, and links inside open in the same view (`‹` goes back). `↵` opens it on its board, `A` adds it to this board (or shows it, if it is already here), `Esc` closes. Picking a note from the links at a note's foot does the same, and so does opening a note that is on no board.
- **Board links** make a note a map of your boards: a "Projects" note with `@@Q3 Launch`, `@@Infra` and so on. Clicking one opens that board and shows a trail of where you came from (`‹ Projects › Q3 Launch`); click a step or press `⌥←` to go back to exactly the view you left. Links only point at boards, they never put anything on one.
- Code blocks are syntax-highlighted as you type: JS/TS, Python, Go, Rust, C-family, shell, SQL, JSON, YAML, CSS, HTML, Ruby, PHP and diff. They auto-indent, take `Tab`, and have their own undo. The language label is a menu.
- Images: paste, drop or `/image`. Pasted images are saved into `assets/` in the vault. **Each image zooms (wheel) and pans (drag) inside its own frame**, separate from the board. Double-click an image to fit it, and drag its bottom edge to change its height.
- Dropping any other file copies it into `files/` and tags it in the note.

**Tags on notes**
- Notes take the same tags as secrets: plain (`api`) and key:value (`env:prod`).
- On the board they show at the foot of each note. Add them with the tag icon or `T` on a selected note; names autocomplete from every tag in the vault.
- Click a tag on a note to see every note with that tag.

**All notes page** (the middle icon, `⌥L`)
- Every note on every board in one sortable table: title and preview, board, tags, links, last updated. Click a column header to sort; click again to reverse.
- Filter with text, board names and tags, e.g. `deploy env:prod -draft`, or click a tag chip.
- `→ 2` / `← 1` show the notes a note links to and the notes linking to it; click for the list.
- Click a row (or `↵`) to jump to the note on its board, or click the board name to open the board.

**Secrets**
- Key/value pairs with plain tags (`aws`) and key:value tags (`env:prod`). Every tag is listed as a chip under the filter; click one to filter by it.
- Filter syntax: `env:prod aws -legacy`.
- Values stay masked until you reveal them. Search never looks at values.
- `c` copies the value, `⇧C` copies the key, and Enter in the filter copies the top match.
- **Export** (the download icon) downloads every secret (key, value, tags, note, dates; no notes) as `frogmouth-secrets-YYYY-MM-DD.json`. Values are in plain text, so it asks first.
- Generate random values.

**Tags and filters** (All notes, Secrets and `⌘K` search alike)
- Tags are plain (`api`) or key:value (`env:prod`); the key is the level above the value, and values can go deeper with `/` (`team:platform/infra`).
- Space means both, comma means either, minus means not: `env:prod,staging aws -legacy`. A key alone (`env:`) means any value, and a parent (`team:platform`) includes everything under it.
- **Autocomplete everywhere you filter**: type a few letters and matching tags appear with how many items carry them. `Tab` or `↵` completes; a key goes on to its values (`en` → `env:` → `env:prod`), and after a comma you get the key's other values.
- The tag row under each filter is a **pivot**: plain tags, then each key with its values (`env: dev prod staging`), each with a count of the current results, so you see what a click leaves. Click to narrow, click a key for any of its values, `⇧`-click a value to add it as an alternative.

**Search everything** with `⌘K`. Prefixes: `>` commands, `@` notes, `$` secrets, `#` boards. With nothing typed it shows the notes you edited most recently, then your boards by when you last opened them. Opening a note that matched in its text (not its title) opens the board's find bar on that word, so you land on the exact spot.

**Calm, readable UI**
- Neutral dark or light theme with softened contrast, quiet note colours, and one accent you choose in the logo menu: **green** (default), **orange** or **purple**.
- Code blocks show line numbers. They are drawn by the page, never part of the code: copying, saving and searching see only your code.

**Sync icon** (top right), next to the name of the folder your vault lives in (or *Browser storage* / *No folder*). Hover it for the full path.
- A file with a tick: everything is saved to the vault file.
- A file with a dot: unsaved changes, saving shortly.
- A file with `!`: the save failed (click to retry), or the file changed on disk (click to choose a version).
- A struck-out file: nothing is written to any file (the in-tab mode). Click to download the vault.
- The vault file is watched. If another window, a sync tool or `git pull` changes it, frogmouth reloads it.
- If you also have unsaved edits, it asks which version to keep.

**Backups**: once a day, the vault file is copied to `.fm-backups/`. The last 14 copies are kept.

## Keyboard

Press `?` in the app for the full list. The app detects your system and labels every shortcut in its own style: `⌘K` on a Mac, `Ctrl+K` on Windows and Linux. Below, `⌘` is Ctrl, `⌥` is Alt and `⇧` is Shift there. One shortcut differs so it never clashes with AltGr on European keyboards: headings are `⌘⌥1`–`3` on a Mac and `Ctrl+Shift+1`–`3` elsewhere, and AltGr combinations always type their character.

| Everywhere | |
|---|---|
| `⌘K` / `⌘P` | Search |
| `⌘⇧P` | Commands |
| `⌘S` | Save now |
| `⌥B` `⌥L` `⌥S` | Board, all notes, secrets |
| `⌥J` | Boards panel: find, open, create, pin, rename, delete |
| `⌥1`–`⌥9`, `⌥[` `⌥]` | Board pills, previous / next board |
| `⌥⇧[` `⌥⇧]` | Move this board left / right |
| `F2` | Rename this board |
| `⌘Z` | Undo a delete or arrange |
| `⌥←` | Back along board links |

| Board | |
|---|---|
| `N` or double-click | New note |
| `Tab` | Next note |
| click, drag | Select, move |
| double-click, `↵` / `Esc` | Edit / stop editing |
| arrows / `⌥⇧` arrows | Nudge / resize |
| `1`–`9` | Colour |
| `⌘D` | Duplicate |
| `T` | Tag the note |
| `L` | Notes that link here |
| `A` | Add an existing note to this board |
| `⇧`-click, `⇧`-drag, `⌘A` | Select several notes |
| `⌘F` | Find in every note on the board |
| `Del` `Del` / `⇧Del` | Remove from this board (confirm with a second `Del`) / delete everywhere (asks first) |
| `=` `-` `0` `⇧1` | Zoom in, out, 100%, fit |
| `M` | Show or hide the minimap |

| Secrets | |
|---|---|
| `j` `k` | Move |
| `c` | Copy value |
| `⇧C` | Copy key |
| `Space` | Reveal |
| `↵` | Edit |
| `N` | New |
| `/` | Filter |
| `Del` or the bin | Delete, after three confirmations |

Buttons are icons; hover one for its name and shortcut.

## The vault folder

```
my-vault/
  vault.fm               # all boards, notes and secrets, as readable JSON
  assets/                # images pasted or dropped into notes
  files/                 # other files dropped into notes
  .fm-backups/           # daily copies of vault.fm
  anything-else.excalidraw   # any file here can be tagged with @
```

`vault.fm` is pretty-printed JSON, so it diffs well in git and you can read or fix it in any editor. Notes are stored once; boards hold placements that point at them:

```json
{"frogmouth":1,"saved":"…","data":{
 "notes":[{"id":"n1","color":"straw","tags":["docs"],"html":"<p>Title</p>…","title":"Title","text":"…"}],
 "boards":[{"id":"b1","name":"Inbox","items":[{"note":"n1","x":80,"y":80,"w":300,"h":null,"z":1}]}],
 "secrets":[{"id":"…","key":"DATABASE_URL","value":"…","tags":["env:prod","db"],"desc":""}],
 "ui":{"board":"…","active":"b:…"}}}
```

The format is specified in [docs/format.md](docs/format.md). It is versioned (`"frogmouth": 1`): later releases may add fields, and every release keeps fields it does not know, so nothing is lost when versions mix. A release never opens a file from a newer, incompatible format, so it can never write over it.

## Privacy and security

- A Content-Security-Policy in the page forbids every network request (`connect-src 'none'`, no external scripts, styles, fonts or images). Nothing leaves your machine.
- Note HTML is sanitized on load and paste. Scripts, event handlers, `javascript:` links, remote images and paths with `..` are removed.
- The vault is a plain JSON file: secrets are as private as the folder they sit in, like any other file on your disk.

## Development

Plain JavaScript modules and CSS, no runtime dependencies. [Vite](https://vite.dev) with [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) inlines everything (code, styles, fonts as base64) into one HTML file.

```sh
npm install
npm run dev          # dev server with hot reload (the no-network policy is relaxed only here)
npm run build        # -> frogmouth.html, the single file to ship
npm test             # builds test/frogmouth.html and runs the smoke suite in headless Chrome
npm run check        # build, confirm the committed frogmouth.html is current, test (what CI runs)
npm run brand        # regenerate docs/brand and the favicon (pip install fonttools brotli)
```

`npm test` needs Python 3 and Chrome (set `CHROME=/path/to/chrome` if it is not in the usual place).

```
src/frogmouth.html    page shell + Content-Security-Policy (built to ./frogmouth.html)
src/main.js           entry: imports the styles and boots the app
src/css/00-fonts.css  JetBrains Mono @font-face (Vite inlines the woff2 files)
src/css/app.css       all styles (night and day themes)
src/fonts/            JetBrains Mono woff2 files + OFL license
src/js/00-util.js     helpers, tags, fuzzy matching, toasts, IndexedDB
src/js/01-bird.js     the frogmouth: wordmark, eye tracking, blinking, lids
src/js/03-store.js    state, the .fm file, autosave, disk watching, images, files
src/js/04-highlight.js  syntax highlighter
src/js/05-ui.js       popup menus, modals, the tag editor
src/js/06-editor.js   note editor: / menu, @ links, markdown shortcuts, code blocks, images
src/js/07-board.js    canvas: notes, drag, resize, pan, zoom, arrange, note tags
src/js/08-secrets.js  secrets list, JSON export
src/js/08b-notes.js   all-notes page: sort, filter, tags, links
src/js/09-palette.js  search and commands
src/js/10-app.js      shell: welcome, floating controls, board pills, sync icon, keyboard
test/smoke.js         smoke tests (UI typing, sanitizer, crypto, real file writes via OPFS)
test/run.py           drives headless Chrome over the DevTools pipe
vite.config.js        single-file build, test mode, dev-only CSP relaxation
src/brand/mark.json   the frogmouth symbol (shared by the app and tools/brand.py)
tools/brand.py        regenerates docs/brand/*.svg and the favicon (pip install fonttools brotli)
```

## Security

See [SECURITY.md](SECURITY.md) for what frogmouth protects against, what it does not, and how to report a vulnerability.

## License

MIT for frogmouth itself.

The page embeds [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), licensed under the SIL Open Font License 1.1 (`src/fonts/OFL.txt`).
