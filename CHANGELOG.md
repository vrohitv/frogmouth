# Changelog

## Unreleased

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
