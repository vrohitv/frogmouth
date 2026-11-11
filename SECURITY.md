# Security

frogmouth is a local productivity tool, an alternative to a notepad: notes and secrets in one plain JSON file on your own disk. There is no server, account or sync service. Secret values can be encrypted with a passphrase if you choose to.

## What it does

- **No network, ever.** A Content-Security-Policy in the page forbids every network request (`connect-src 'none'`, no external scripts, styles, fonts or images). The app works offline from `file://`.
- **Safe pasting.** HTML pasted into notes is sanitized: scripts, event handlers, `javascript:` links and remote images are removed, so content copied from the web can't run in the app.
- **Files open in a sandbox.** Files in the vault folder open as what they are (HTML renders, SVG and PDFs show), but anything that can run script (HTML, SVG) opens inside a sandboxed frame with its own unique origin and a policy that forbids every load and navigation. A downloaded report can run its own scripts there, but it can't read the app's storage or your vault, open windows, navigate away or reach the network.
- **An optional passphrase for secret values.** Each value is encrypted with AES-GCM (a fresh 12-byte IV per value) under a key derived from the passphrase with PBKDF2-SHA256 and 600,000 rounds, using the browser's own WebCrypto. The key and the decrypted values exist only in memory while unlocked; the file only ever holds ciphertext. It locks when the vault closes or is read again, on Lock now, and after 15 idle minutes. A vault with a passphrase is written as format 2, which older releases refuse to open.
- **Closing clears the page.** Closing a vault removes notes, revealed secret values and the search index from the page and memory.

## What it does not do

- The vault, its images and files, and the backups in `.fm-backups/` are ordinary files: anyone who can read the folder can read them, as with any document on your disk. With a passphrase, secret values are encrypted; secret keys, tags and notes, and all notes, are not.
- A forgotten passphrase cannot be recovered, and nothing stops guessing at a copied file other than the passphrase's strength: choose a long one.
- Recently deleted keeps deleted notes and boards in the vault file for 30 days. Deleted secrets are not kept, but older backups still hold them until those are pruned.
- Values you copy go to the system clipboard and stay there until something else is copied.

## Reporting a problem

Please report security issues privately through GitHub: **Security → Report a vulnerability** on [vrohitv/frogmouth](https://github.com/vrohitv/frogmouth/security/advisories/new).
