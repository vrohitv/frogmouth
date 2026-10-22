# Security

frogmouth is a local productivity tool, an alternative to a notepad: notes and secrets in one plain JSON file on your own disk. There is no server, account, sync service or encryption.

## What it does

- **No network, ever.** A Content-Security-Policy in the page forbids every network request (`connect-src 'none'`, no external scripts, styles, fonts or images). The app works offline from `file://`.
- **Safe pasting.** HTML pasted into notes is sanitized: scripts, event handlers, `javascript:` links and remote images are removed, so content copied from the web can't run in the app.
- **Files open in a sandbox.** Files in the vault folder open as what they are (HTML renders, SVG and PDFs show), but anything that can run script (HTML, SVG) opens inside a sandboxed frame with its own unique origin and a policy that forbids every load and navigation. A downloaded report can run its own scripts there, but it can't read the app's storage or your vault, open windows, navigate away or reach the network.
- **Closing clears the page.** Closing a vault removes notes, revealed secret values and the search index from the page and memory.

## What it does not do

- The vault, its images and files, and the daily backups in `.fm-backups/` are ordinary files: anyone who can read the folder can read them, as with any document on your disk.
- Values you copy go to the system clipboard and stay there until something else is copied.

## Reporting a problem

Please report security issues privately through GitHub: **Security → Report a vulnerability** on [vrohitv/frogmouth](https://github.com/vrohitv/frogmouth/security/advisories/new).
