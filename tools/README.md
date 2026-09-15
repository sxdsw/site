# Password-protected work section

The `work` tab serves encrypted content. Visitors enter a password at
`pages/work.html`, which decrypts everything in the browser. The server never
checks anything — GitHub Pages can't — so the protection comes from the
ciphertext itself, not from hiding a page.

## Layout

| path | committed? | contents |
|---|---|---|
| `work-src/` | **no** (gitignored) | plaintext HTML + images |
| `pages/work/` | yes | AES-256-GCM ciphertext, one `.enc` per file |
| `pages/work/meta.json` | yes | KDF salt + iteration count (not secret) |
| `pages/work.html` | yes | password gate and decryption logic |

## Adding or changing work

1. Edit files under `work-src/`. An image path decides whether it is private:

   - `medianala/1.png` — a path inside `work-src/` is encrypted with the page.
   - `../media/blackRectangle.png` — a `../` path is left alone and served
     publicly from the repo, like on any other page.

   Stylesheets need no special handling. The gate reads each page's own
   `<link rel="stylesheet">` tags and loads them when that page is shown, so
   `nala.css` and `roleplay.css` are never live at the same time — they both
   redefine `--vo-ink` and `--vo-text-size` and would otherwise fight. The
   page's `<body>` class travels across too.
2. To add a page to the index, add it to `ENTRIES` in `tools/encrypt.mjs`. The
   title you give it is what appears in the sidebar's Work tab once unlocked —
   `pages/work.html` sends the list to `app.js`, which appends the links to
   `#workLinks` in `index.html`. Those links only ask the frame to swap entry;
   the key never leaves it, so browsing to any other page re-locks the section.
3. Rebuild:

   ```
   node tools/encrypt.mjs
   ```

   It prompts for the password (or set `WORK_PASSWORD`). Use the **same
   password every time**, or previously shared links stop working.

4. Commit `pages/work/` and push. Never commit `work-src/`.

## What this does and does not protect

Without the password the content is genuinely unreadable — AES-256-GCM with
a PBKDF2-SHA-256 key (250,000 iterations). Brute force is bounded by password
strength, so use a long one; a dictionary word offers little.

It does **not** retroactively protect anything already pushed. Content that was
public remains in git history and in any cache or fork. Encrypting it now only
protects it going forward.

Search engines cannot index the content, and a lost password is unrecoverable —
there is no reset, only re-encrypting from `work-src/`.
