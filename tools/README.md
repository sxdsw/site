# Password-protected work section

The `work` tab serves encrypted content. Visitors enter a passphrase at
`pages/work.html`, which decrypts everything in the browser. The server never
checks anything — GitHub Pages can't — so the protection comes from the
ciphertext itself, not from hiding a page.

## Layout

| path | committed? | contents |
|---|---|---|
| `work-src/` | **no** (gitignored) | plaintext HTML + images |
| `pages/work/` | yes | AES-256-GCM ciphertext, one `.enc` per file |
| `pages/work/meta.json` | yes | KDF salt + iteration count (not secret) |
| `pages/work.html` | yes | passphrase gate and decryption logic |

## Adding or changing work

1. Edit files under `work-src/`. Reference images with plain relative paths
   (`medianala/1.png`), mirroring the folder layout inside `work-src/`.
2. To add a page to the index, add it to `ENTRIES` in `tools/encrypt.mjs`.
3. Rebuild:

   ```
   node tools/encrypt.mjs
   ```

   It prompts for the passphrase (or set `WORK_PASSPHRASE`). Use the **same
   passphrase every time**, or previously shared links stop working.

4. Commit `pages/work/` and push. Never commit `work-src/`.

## What this does and does not protect

Without the passphrase the content is genuinely unreadable — AES-256-GCM with
a PBKDF2-SHA-256 key (250,000 iterations). Brute force is bounded by passphrase
strength, so use a long one; a dictionary word offers little.

It does **not** retroactively protect anything already pushed. Content that was
public remains in git history and in any cache or fork. Encrypting it now only
protects it going forward.

Search engines cannot index the content, and a lost passphrase is unrecoverable —
there is no reset, only re-encrypting from `work-src/`.
