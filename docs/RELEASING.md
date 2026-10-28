# Releasing

Elmory is published to npm as [`elmory`](https://www.npmjs.com/package/elmory). Publishing needs
an npm account that owns the package; GitHub access alone cannot publish.

`npm publish` runs `prepublishOnly` first: it builds and runs `npm test`, so a failing test stops
the release. Timing bounds are not in `npm test`; run `npm run test:timing` on a quiet machine
before a release.

## First release (once, from your machine)

The package does not exist on npm until this runs, so trusted publishing cannot be set up yet.

1. Merge everything for the release into `main`, then update a clean checkout:
   ```bash
   git switch main && git pull
   npm ci
   ```
2. Check what will ship (expect `dist/`, `README.md`, `LICENSE`, `package.json`):
   ```bash
   npm pack --dry-run
   ```
3. Log in and publish:
   ```bash
   npm login                # opens the browser; use an account with 2FA on
   npm publish              # unscoped packages are public; asks for a 2FA code if set
   ```
4. Check it from outside the repo:
   ```bash
   npm view elmory version
   cd "$(mktemp -d)" && npm i -g elmory && elmory --version
   ```
5. Tag the release and publish its notes on GitHub (the workflow below is not set up yet, so
   this release does not publish again):
   ```bash
   git tag v0.1.0 && git push origin v0.1.0
   gh release create v0.1.0 --title "v0.1.0" --generate-notes
   ```

## Set up trusted publishing (once, after the first release)

After this, a GitHub release publishes to npm through `.github/workflows/publish.yml`, with no
npm token stored anywhere.

1. On npmjs.com: **elmory → Settings → Trusted Publisher → GitHub Actions**.
2. Enter owner `Rakshan001`, repository `elmory`, workflow file `publish.yml`, and save.
3. Optional, recommended: on the same page, set **Publishing access** to require 2FA and
   disallow tokens, so only the workflow (or you with 2FA) can publish.

## Every later release

1. On a branch, bump the version and open a PR (`npm version` edits `package.json` and
   `package-lock.json`; `--no-git-tag-version` leaves tagging to the release):
   ```bash
   npm version patch --no-git-tag-version     # or minor / major
   ```
2. Merge the PR into `main`.
3. Create the release from `main`. The tag must be `v` + the version in `package.json`, or the
   workflow stops before publishing:
   ```bash
   gh release create v0.1.1 --target main --title "v0.1.1" --generate-notes
   ```
4. Watch the run (`gh run watch`), then check `npm view elmory version`.

## Version numbers

Semver, still below 1.0: a patch for fixes, a minor for new commands or flags, and a minor
(with a note in the release) for any change to the record format or the CLI exit codes.

## If a release is wrong

`npm unpublish elmory@<version>` works only within 72 hours and the version number can never be
used again. Prefer publishing a fixed patch version, and mark the bad one:

```bash
npm deprecate elmory@<version> "broken: use <fixed version>"
```
