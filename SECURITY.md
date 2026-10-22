# Security

frogmouth is a local productivity tool, an alternative to a notepad: notes and secrets in one plain JSON file on your own disk. There is no server, account, sync service or encryption.

## What it does

- **No network, ever.** A Content-Security-Policy in the page forbids every network request (`connect-src 'none'`, no external scripts, styles, fonts or images). The app works offline from `file://`. Files you open from the vault folder carry the same policy.
- **Safe pasting.** HTML pasted into notes is sanitized: scripts, event handlers, `javascript:` links and remote images are removed, so content copied from the web can't run in the app.
- **Your files are yours.** Images and files in the vault folder are opened as what they are (HTML renders, SVG and PDFs show) because they are the user's own.
- **Closing clears the page.** Closing a vault removes notes, revealed secret values and the search index from the page and memory.

## What it does not do

- The vault, its images and files, and the daily backups in `.fm-backups/` are ordinary files: anyone who can read the folder can read them, as with any document on your disk.
- Values you copy go to the system clipboard and stay there until something else is copied.

## Reporting a problem

Please report security issues privately through GitHub: **Security → Report a vulnerability** on [vrohitv/frogmouth](https://github.com/vrohitv/frogmouth/security/advisories/new).
