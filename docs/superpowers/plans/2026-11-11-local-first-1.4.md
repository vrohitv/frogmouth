# frogmouth 1.4.0: local-first safety, undo everywhere, faster boards — plan

**Goal:** make frogmouth trustworthy as the only home of personal brainstorming and temp notes: no silent data loss, every board change undoable, deleted things recoverable, fast on very large boards, and the brainstorming moves people expect from a diagram tool.

**Source:** the audit of 2026-11-11 (performance measured in headless Chrome and real Chrome; data-loss bug reproduced with two tabs). The user asked for every item of it.

**Constraints (from the project):** one HTML file, no libraries, no network. Vault format stays 1 for every vault without a passphrase; additions are additive fields (`docs/format.md`). Keyboard-first. Tests: `test/smoke.js` (`ok(name, cond, info)`), `npm run check`.

## Decisions made for the user
- Encryption is opt-in and covers secret **values** only; keys, tags and notes stay searchable. A vault with a passphrase is written as **format 2**, so older releases refuse it instead of misreading it. PBKDF2-SHA256 (600 000 rounds) → AES-GCM-256, a fresh 12-byte IV per value; the key never leaves memory; it locks on close, on "Lock now", and after 15 minutes idle.
- Trash keeps deleted **notes and boards** for 30 days (`data.trash`). Deleted secrets are not kept.
- Copy+paste makes copies; cut+paste moves the originals. `⌘D` uses the same path, so lines and frame contents come along.
- **Dropped at the user's request** ("no keyboard shortcuts for arrows, only the mouse; don't overcomplicate the app"): the keyboard-made connected note, quick capture, and the align/distribute buttons. Alignment guides while dragging stay: they are part of the mouse drag and add no controls.
- Export draws notes as paper cards with their text (SVG and PNG, no libraries). Markdown goes to `markdown/` in the vault folder, or one downloaded `.md` without a folder.
- Undo/redo for the board is recorded from snapshots of the mounted board (placements, shapes, note colours, library membership) taken whenever `Store.change` lands; z-order changes alone are not steps. Deletions keep their precise closures. Note text keeps the browser's undo.
- Not done: notes that delete themselves (recommended against; Trash covers safety).

## Tasks
1. **Data safety**: the on-disk check covers OPFS vaults (save and watcher); `navigator.storage.persist()` for browser storage. Tests: two writers on one OPFS vault → conflict, not overwrite; persist requested.
2. **Performance**: O(1) placement lookup in Board; Draw skips wires whose geometry did not change; note bodies get `content-visibility: auto` with measured `contain-intrinsic-size`. Tests: lookups stay right after remove/undo; unchanged wires are not rewritten; off-screen notes keep their real height for lines, fit and minimap. Verify fps in real Chrome.
3. **Undo/redo everywhere** (`07d-history.js`): ⌘Z / ⌘⇧Z / ⌘Y; move, resize, nudge (coalesced), colour, style, shape text, labels, re-attach, order, add, duplicate, arrange. Tests per gesture, redo, coalescing, z-only clicks not recorded.
4. **Trash**: `data.trash`, Recently deleted page (restore, delete forever, empty), 30-day purge. Tests.
5. **Backups**: hourly snapshots while editing (keep 48) besides the daily ones (14), backups for browser storage too, a Restore screen (list, preview counts, restore with undo; the current file is saved first). Tests.
6. **Copy / cut / paste / duplicate** with lines and frame contents. Tests.
7. ~~Connected note~~ — dropped.
8. ~~Quick capture~~ — dropped.
9. **Alignment guides** while dragging (Alt turns off). Tests. (~~align and distribute~~ — dropped.)
10. **Export** board / selection as SVG and PNG; notes as Markdown. Tests.
11. **Encryption** of secret values. Tests: round trip, wrong passphrase, locked behaviour, format 2 written only with a passphrase, remove protection.
12. **Docs, version 1.4.0, changelog, README, shortcuts; release.**
