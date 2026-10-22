# Changelog

## Unreleased

- **Inline fields confirm when you leave them.** Note tags (on the board and in All notes) and board names (on the pill and in the Boards panel) now share one behaviour: `↵` saves and closes the field, `Esc` cancels, and a click anywhere else saves, including on the board, another note or the floating bar.
- Fixed: pressing `↵` in a board note's tag field saved the tags but left the field on screen, so the chips never came back; each further edit stacked another field.
- Fixed: clicking the board while renaming a board pill kept the field open, and clicking another pill while renaming saved the name but did not switch to that board.
- Fixed: two renames at once in the Boards panel could lose one; clicking another row now keeps the rename in progress.
- **Deleting a secret** now has a visible bin on every row (as well as `Del` and the bin in the editor), and takes three confirmations: a warning, the key name typed out, and a last check. Each step has the safe choice focused. Undo still works until the tab closes.
- **No stray click or key saves or deletes anything:**
  - Dialogs that delete something focus Cancel, so `↵` or `Space` cancels; the destructive button takes a click or `⌘↵` / `Ctrl+Enter` (shown on it).
  - Menus, `⌘K` results, the Boards panel and the colour picker act on a full click, so pressing the wrong item and sliding off it does nothing.
  - Double-clicking a note's × no longer arms and confirms the removal in one go.
  - The secret editor no longer saves on a click outside it: with changes it stays open and says `⌘↵` saves, `Esc` discards; without changes it closes.
  - Arrange can be undone (`⌘Z`).
- Fixed: the Cancel button in confirmation dialogs did nothing (only `Esc` or a click outside closed them).
- **Icons instead of words on buttons:** new secret, export, save, cancel, delete, the note view's actions, `+` for a new note, tags, links and boards at a note's foot, search, undo in toasts and every dialog's buttons. Each has its name and shortcut in its tooltip and for screen readers. Words stay where they are the content (tags, key and board names) and on the first-run screen and the disk-conflict choice, where an icon alone would be a guess.
- **More keyboard:** `⌥⇧` + arrows resize the selected notes, `⌥⇧[` / `⌥⇧]` move the current board left or right among the pills (also in `⌘⇧P`), `L` opens "notes that link here", and `⌘↵` ticks the todo item under the caret.
- The note view goes back to reading when you click outside the text, with no caret left in it.
- After editing tags in All notes, a click into the filter keeps focus there.
- `↵` that finishes an IME composition no longer saves an inline field halfway.

## 1.2.1 (2026-10-22)

- **Colour picker**: each note has one small colour button instead of a row of nine swatches. It opens a compact 3 × 3 picker of the papers in the current theme, with the current one marked: click, press `1`–`9`, or use the arrows and `↵`; `Esc` or a click outside closes it. With several notes selected it colours all of them. The `1`–`9` keys on the board work as before.
- The bird no longer wakes up from pointer events the browser sends when the page changes under a still mouse; only real movement or a key wakes it.

## 1.2.0 (2026-10-22)

- **The note view**: clicking a note link opens the note full size over your board instead of taking you away. Read it, click to edit, follow its links in the same view (`‹` back); `↵` opens it on its board, `A` adds it here (or shows it if it is already here), `Esc` closes. Also used for "N notes link here" and for notes on no board.
- **+ Note** button beside the zoom control: a new note (`N`) or an existing one (`A`), so adding existing notes to a board is visible.
- **Tag search**: tags autocomplete in the All notes and Secrets filters and in `⌘K` (with counts; a key goes on to its values). Commas mean either (`env:prod,staging`), `env:` means any value, and a parent value includes deeper ones (`team:platform` → `team:platform/infra`). The tag row is a pivot: grouped by key, with counts of the current results; click to narrow, `⇧`-click to add an alternative. `⌘K` treats tag tokens exactly.
- **Board links**: `@@` (or the `@` menu, which now lists boards too) puts a link to a board in a note, so one note can be the map of all your boards. Following links shows a trail (`‹ Projects › Q3 Launch`); click a step or press `⌥←` to go back to the view you left. Links never place anything on a board, and a link to a deleted board is struck through.

## 1.1.0 (2026-10-22)

- **Minimap and zoom control** at the bottom right of the board: the zoom percentage with `−` / `+` / Fit (click the percentage for 100%), and a minimap of every note in its colour with the visible area framed; click or drag in it to move. `M` toggles the minimap. The view is now always derived from the saved camera, so the same camera at the same window size gives bit-for-bit the same view.
- **Nine note colours that switch with the theme**, like Keep or Samsung Notes: each is a light/dark pair designed in OKLCH, so every colour has the same perceived lightness (soft pastels by day, calm charcoal tints at night) and keeps its hue in both themes, with text at 9.7:1 contrast or better. New: apricot, heather (lilac) and sea (teal); keys `1`–`9`. A colour name from a newer release shows as moth.
- **The bird falls asleep**: after two minutes idle its eyes close into calm curves, it breathes slowly and small z's drift up beside its head (still z's with reduced motion). Any mouse move or key wakes it with a double blink. Before that it squints (30 s) and gets sleepy (75 s).
- **Soothing colours**: the frogmouth's eyes are sage green (`#8DB49A`) instead of amber, in the live bird, the wordmark's eye-o's, every logo file and the favicon; and the default accent is the calm green instead of orange. An accent picked in the logo menu is still remembered.
- **Resize notes from every edge and corner**, not only the right and bottom. Dragging the left or top edge moves the note so the opposite edge stays exactly in place (measured with the note's exact height, so even a note sized to its content keeps its bottom edge to the pixel); the dragged edge snaps to the grid.

## 1.0.0 (2026-10-22)

First release.

- One plain JSON vault file per folder: `vault.fm`, with daily backups in `.fm-backups/`.
- Notes live in one library and can sit on several boards; deleting a board never deletes notes.
- All-notes page with sorting, filters, tags and links in both directions; tags shared with secrets.
- Board pills (pinned boards always keep one, recent boards fill the rest) and a Boards panel for any number of boards (`⌥J`): search, open, create, pin, rename, delete, with note counts and last-opened times.
- Secrets: key/value with plain and key:value tags, centred editor, JSON export.
- Disk-change detection and conflict resolution. No encryption: frogmouth is a productivity tool, an alternative to a notepad.
- Brand: frogmouth symbol, wordmark and logo system in `docs/brand/`.
- Calm UI: neutral, untinted surfaces in dark and light, softened text contrast, muted note colours (dark tints at night, soft pastels by day, a neutral grey by default) and one accent of your choice: Anthropic orange (default), green or purple.
- Shortcuts follow your system: macOS shows `⌘ ⌥ ⇧`, Windows and Linux show `Ctrl+`, `Alt+`, `Shift+`. Headings are `Ctrl+Shift+1`–`3` off the Mac, and AltGr keys always type, so European layouts can type `@`, `{` and `[` in notes.
- Line numbers in code blocks, drawn with CSS counters so they are never copied, saved or searched; a softer, familiar syntax palette.
- **Several notes at once**: `⇧`-click, a `⇧`-drag box or `⌘A`. Move, nudge, colour, duplicate, remove or delete them together, with one undo.
- **Find on a board** (`⌘F` / `Ctrl+F`): every match in every note, a count, notes without a match faded, stepping with `↵`, scrolling inside long notes and wide code blocks. Highlights use the CSS Custom Highlight API, so notes are never modified.
- **Tables** in notes: `/table` or `/table 4x3`, `Tab` / `↵` between cells, row and column actions in the `/` menu inside a table, and clean pasting from spreadsheets and web pages. Table text is part of search.
- **Search** shows "Recently edited" notes (with how long ago) and boards by last opened when nothing is typed, and opening a note that matched in its text lands on the match.
- **Display changes are exact**: the view is kept as the board point at the centre of the window plus the zoom, so plugging in or unplugging a monitor, resizing or browser zoom never moves notes or loses your place, and returning to a size restores the identical view. Arrange no longer depends on the window width. Dragged positions are whole pixels.
- The `/` menu ranks a two-word command first when all of it is typed (`/delete row`).
- **The .fm format is specified and versioned** ([docs/format.md](docs/format.md)): one version number (`"frogmouth": 1`), unknown fields kept on save, files from a newer format refused untouched, and JSON that is not a vault refused, including from Import.

### Fixed in the pre-release audit

- Leaving a note no longer leaves a text caret blinking in it.
- The All notes and Secrets filters, and the board's find bar, sat 10px under the floating bar; they now have a clear gap, on wide and narrow windows.
- A vault reloaded after an outside change (sync tool, git, another window) left the board showing stale notes; every view now re-renders, and a reload waits while you are typing.
- Closing left note text, revealed secret values and the search index in memory; they are now cleared.
- "Save failed" could not recover from a revoked folder permission; clicking it now asks for access again.
- Errors in background work (for example saving a pasted image) are now reported instead of failing silently.
- A save finishing while you were still typing marked the vault as saved, so closing the tab right then lost the newest edit without a warning. Saves now track exactly which change they wrote.
- A change made on disk while you had unsaved edits was flagged, then overwritten by the save that was already scheduled. Saves now check the file first and stop on a conflict until you choose.
- "Keep mine" could switch off disk watching for good if its save failed.
- Typing and closing the tab within a fraction of a second could lose the last keystrokes; pending note edits are now pushed before the tab closes or hides.
- A stray "null" appeared in the board pills when every board fitted.
- The keyboard shortcuts dialog listed "[object HTMLElement]" instead of the shortcuts (an element helper flattened nested children only one level); it now shows every shortcut, opens at the top, and lays out in three columns.
- Files tagged in notes open as themselves (HTML renders, SVG and PDFs show).
- The Boards panel's delete moved to `⌘⇧⌫` (`Ctrl+Shift+Backspace`) so `⌘⌫` in its search box deletes text as usual.
- Removed unused code left over from earlier layouts.
