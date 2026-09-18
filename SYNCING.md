# Syncing this workspace with GitHub

The repo lives at `https://github.com/sxdsw/site.git`. The local `main` branch
already tracks `origin/main`, so syncing is just the commit-and-push routine
below — there is no setup left to do.

## The routine

1. **See what changed.**

   ```
   cd /Users/trinitywong/Documents/Site
   git status
   ```

2. **Pull first.** Always, before committing, so your work sits on top of
   whatever GitHub already has.

   ```
   git pull
   ```

3. **Stage what you want to send.**

   ```
   git add .                                    # everything, or
   git add pages/collisions.html style.css      # named files
   ```

   `git add .` is safe here. `.gitignore` already blocks the video files and
   the plaintext `work-src/` pages, so a blanket add can't leak either.

4. **Commit.**

   ```
   git commit -m "Add collisions and contact pages"
   ```

5. **Push.**

   ```
   git push
   ```

6. **Confirm.** `git status` should now read *"Your branch is up to date with
   'origin/main'"*.

## Things that bite

**The pre-commit hook.** If you edited anything under `work-src/`, step 4 will
refuse and tell you to rebuild. That is deliberate: `work-src/` is gitignored,
so an edit there leaves the tree looking clean while the site keeps serving the
old ciphertext. Run the rebuild, then commit again.

```
node tools/encrypt.mjs
```

To commit past it anyway: `git commit --no-verify`. See `tools/README.md`.

**Large files.** GitHub rejects anything over 100 MB. `documentary_v2.mp4` and
every other `*.mp4` are gitignored for that reason — the video is hosted
elsewhere. Don't force one in; the push will fail partway and leave a mess.

The settings that keep big pushes from dying with an HTTP 400 are already set
on this clone:

```
http.postBuffer = 524288000
http.version    = HTTP/1.1
```

Nothing to do unless you clone the repo fresh somewhere else, in which case set
them again.

## On another machine

Pull to bring changes down:

```
git pull
```

If git complains about local edits blocking the pull, either commit them first
or set them aside with `git stash`, pull, then `git stash pop`.
