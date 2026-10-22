# Changelog

## 1.0.0

First production release.

- **Vault file renamed to `.fm`** (`vault.fm`, backups in `.fm-backups/`). Vaults from earlier builds (`vault.frogmouth`) are copied to `.fm` when opened; the old file is left untouched.
- Notes live in one library and can sit on several boards; deleting a board never deletes notes.
- All-notes page with sorting, filters, tags and links in both directions; tags shared with secrets.
- Board pills with a searchable board picker for many boards (`⌥J`).
- Secrets: key/value with plain and key:value tags, centred editor, JSON export.
- Optional AES-256-GCM encryption, auto-lock, daily backups, disk-change detection and conflict resolution.
- Brand: frogmouth symbol, wordmark and logo system in `docs/brand/`.

### Fixed in the pre-release audit

- Opening a tagged HTML or SVG file could run it with the app's origin; such files now open as plain text or download.
- A vault reloaded after an outside change (sync tool, git, another window) left the board showing stale notes; every view now re-renders, and a reload waits while you are typing.
- Locking or closing left note text, revealed secret values and the search index in memory; they are now cleared.
- Encrypted vaults were not backed up daily; they now are, like plain vaults.
- "Save failed" could not recover from a revoked folder permission; clicking it now asks for access again.
- Errors in background work (for example saving a pasted image) are now reported instead of failing silently.
- Removed unused code left over from earlier layouts.
