# Security

frogmouth keeps notes and secrets in one file on your own disk. There is no server, account or sync service.

## What it protects against

- **Network leaks.** A Content-Security-Policy in the page forbids every network request (`connect-src 'none'`, no external scripts, styles, fonts or images). The app works offline from `file://`.
- **Hostile note content.** Note HTML is sanitized on load and paste: scripts, event handlers, `javascript:` links, remote images and paths containing `..` are removed. Files tagged in notes never open as live documents: HTML, SVG and other active types open as plain text or are downloaded.
- **Reading the vault file at rest**, when you set a passphrase: the `.fm` file is AES-256-GCM encrypted, with a key from PBKDF2-SHA256 (600,000 iterations) and a fresh IV on every save. The key is non-extractable and stays in memory only while unlocked.
- **Leaving it open.** An encrypted vault locks after 15 minutes idle or with `⌘⇧L`. Locking or closing clears notes, revealed secret values and the search index from the page.

## What it does not protect against

- A plain (unencrypted) vault is readable by anyone who can read the folder.
- Images and files you add to the vault folder are never encrypted.
- Daily backups in `.fm-backups/` are copies of the vault file as it was: encrypted if the vault was, plain if not.
- Values you copy go to the system clipboard and stay there until something else is copied.
- Anything with access to your unlocked browser session, such as malware or a malicious extension.
- A forgotten passphrase. There is no recovery.

## Reporting a vulnerability

Please report it privately through GitHub: **Security → Report a vulnerability** on [vrohitv/frogmouth](https://github.com/vrohitv/frogmouth/security/advisories/new). Do not open a public issue.
