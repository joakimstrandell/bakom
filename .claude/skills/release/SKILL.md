---
name: release
description: |
  Bump version, update CHANGELOG.md, commit, tag, and deploy to Vercel.
  Usage: /release [patch|minor|major]
  Defaults to patch if no argument given.
---

# Release

Create a new release of Bakom. This is the ONLY way to deploy to Vercel.

## Process

1. **Determine bump type** from the argument: `patch` (default), `minor`, or `major`.

2. **Read current version** from `package.json` `version` field.

3. **Calculate new version** using semver rules:
   - `patch`: 0.1.0 → 0.1.1 (bug fixes, small tweaks)
   - `minor`: 0.1.0 → 0.2.0 (new features, non-breaking changes)
   - `major`: 0.1.0 → 1.0.0 (breaking changes, major milestones)

4. **Generate changelog entry** from git commits since the last tag:
   - Run: `git log $(git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD)..HEAD --oneline`
   - Group commits by type based on conventional commit prefixes:
     - `feat:` → **Added**
     - `fix:` → **Fixed**
     - `refactor:` → **Changed**
     - `docs:` → **Documentation**
     - `chore:` → **Maintenance**
     - Other → **Changed**
   - Write human-readable descriptions (not raw commit messages)
   - Use today's date in YYYY-MM-DD format

5. **Update files:**
   - Update `version` in `package.json`
   - Prepend new entry to `CHANGELOG.md` (after the header, before existing entries)

6. **Show the changelog entry** to the user and ask for confirmation before proceeding.

7. **Commit and tag:**
   - Stage `package.json` and `CHANGELOG.md`
   - Commit with message: `release: v{version}`
   - Create annotated git tag: `git tag -a v{version} -m "Release v{version}"`

8. **Push and deploy:**
   - Push commit and tag: `git push && git push --tags`
   - The Vercel deployment will be triggered automatically by the push.

## Important

- ALWAYS show the changelog to the user for review before committing.
- NEVER deploy without going through this release process.
- The version in `package.json` is the source of truth.
- The `__APP_VERSION__` and `__BUILD_TIME__` globals are injected at build time by Vite (see `vite.config.ts`).
- CHANGELOG.md follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.
