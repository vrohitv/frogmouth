# Changelog

## 1.0.0

First production release.

- **Vault file renamed to `.fm`** (`vault.fm`, backups in `.fm-backups/`). Vaults from earlier builds (`vault.frogmouth`) are copied to `.fm` when opened; the old file is left untouched.
- Notes live in one library and can sit on several boards; deleting a board never deletes notes.
- All-notes page with sorting, filters, tags and links in both directions; tags shared with secrets.
- Board pills with a searchable board picker for many boards (`⌥J`).
- Secrets: key/value with plain and key:value tags, centred editor, JSON export.
- Plain JSON vault with daily backups, disk-change detection and conflict resolution. Encryption was removed: frogmouth is a productivity tool, not a password manager. A vault encrypted by an earlier build asks for its passphrase once and is saved back as plain JSON (the encrypted original goes to `.fm-backups/`).
- Brand: frogmouth symbol, wordmark and logo system in `docs/brand/`.

### Fixed in the pre-release audit

- A vault reloaded after an outside change (sync tool, git, another window) left the board showing stale notes; every view now re-renders, and a reload waits while you are typing.
- Closing left note text, revealed secret values and the search index in memory; they are now cleared.
- "Save failed" could not recover from a revoked folder permission; clicking it now asks for access again.
- Errors in background work (for example saving a pasted image) are now reported instead of failing silently.
- A save finishing while you were still typing marked the vault as saved, so closing the tab right then lost the newest edit without a warning. Saves now track exactly which change they wrote.
- A change made on disk while you had unsaved edits was flagged, then overwritten by the save that was already scheduled. Saves now check the file first and stop on a conflict until you choose.
- "Keep mine" could switch off disk watching for good if its save failed.
- Typing and closing the tab within a fraction of a second could lose the last keystrokes; pending note edits are now pushed before the tab closes or hides.
- A stray "null" appeared in the board pills when every board fitted.
- Files tagged in notes open as themselves (HTML renders, SVG and PDFs show).
- Removed unused code left over from earlier layouts.
