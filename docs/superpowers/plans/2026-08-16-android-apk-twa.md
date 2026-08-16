# Android APK (TWA) Web Assets Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. This plan is executed directly in-session (single small feature, no dedicated worktree/subagent ceremony needed) rather than via subagent-driven-development.

**Goal:** Add the PWA manifest fields, icon set, and layout meta tags needed so pwabuilder.com can generate a working Trusted Web Activity (TWA) Android package for the game.

**Architecture:** Static assets only - no game logic changes. One source SVG icon is rasterized to the required PNG sizes via a one-off Node script using `sharp` (dev-time tool, not a runtime dependency).

**Tech Stack:** Next.js static `public/` assets, `sharp` (devDependency, one-off script only).

Spec: `docs/superpowers/specs/2026-08-16-android-apk-twa-design.md`

---

### Task 1: Author the source icon SVG

**Files:**
- Create: `scripts/icon-source.svg`

- [ ] Write an SVG icon: dark green (#17211a) background circle/square, gold (#d3b26d) laurel-wreath-and-ace motif, all important content within the center 80% (maskable safe zone).
- [ ] Open the SVG in a browser (or view tool) to visually sanity-check it renders as expected.

### Task 2: Generate PNG icon set

**Files:**
- Create: `scripts/generate-icons.js` (one-off, not part of the app bundle)
- Create: `public/icons/icon-48.png`, `icon-72.png`, `icon-96.png`, `icon-144.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`

- [ ] **Step 1:** `npm install --save-dev sharp`
- [ ] **Step 2:** Write `scripts/generate-icons.js` that reads `scripts/icon-source.svg` and writes each PNG size via `sharp(...).resize(size, size).png().toFile(...)`. The maskable variant reuses the same SVG (safe zone already respected in the artwork).
- [ ] **Step 3:** Run: `node scripts/generate-icons.js`
- [ ] **Step 4:** Verify: `Get-ChildItem public/icons` lists all 7 files; open `icon-48.png` and `icon-512.png` with the `view` tool to confirm they look correct (legible at small size, no important content clipped in the maskable preview area).

### Task 3: Update the manifest

**Files:**
- Modify: `public/manifest.json`

- [ ] Update `name`/`short_name` to "Bitevní karty", add `id: "/"`, add `scope: "/"`, keep `start_url: "/"`, `display: "standalone"`, `background_color`/`theme_color: "#17211a"`.
- [ ] Replace the `icons` array with all 7 generated sizes; the `icon-512-maskable.png` entry gets `"purpose": "maskable"`, the 512 "any" entry keeps `"purpose": "any"` (or omitted, which defaults to "any").

### Task 4: Update layout meta tags

**Files:**
- Modify: `app/layout.tsx`

- [ ] Update `metadata.title`/`description` to reflect "Bitevní karty" (or keep bilingual - confirm with existing i18n approach; this is static Next.js metadata, not runtime-translated).
- [ ] Add `metadata.icons` (apple-touch-icon pointing at `icon-192.png`, and standard icon entries) so iOS home-screen add-to-home-screen also gets a correct icon.
- [ ] Keep `viewport.themeColor` in sync with the new `#17211a` value.

### Task 5: Verify

**Files:** none (verification only)

- [ ] Run: `npm run build` — expect clean build, no new warnings.
- [ ] Run: `npm run lint` — expect clean.
- [ ] Manually load the production build (or dev server) in a browser, open DevTools → Application → Manifest, confirm no manifest errors and icons resolve.

### Task 6: Commit

- [ ] `git add -A && git commit -m "Add PWA manifest fields and icon set for Android TWA packaging"`
- [ ] Do NOT push automatically - wait for explicit user instruction (project rule).

---

## Manual steps outside this repo (for the user, after the above is deployed)

1. Deploy the above changes (push + Vercel auto-deploy).
2. Go to pwabuilder.com, enter `https://cardgame-eta-five.vercel.app/`, generate a signed Android package with package name `cz.hradecak.bitevnikarty`.
3. Save the downloaded keystore file securely (not in this repo).
4. Get the SHA-256 fingerprint from PWABuilder's output; send it back so `public/.well-known/assetlinks.json` can be added and deployed (a follow-up task, not part of this plan, since the fingerprint isn't known yet).
5. Install the APK on an Android device and verify the address bar disappears once Digital Asset Links verification succeeds.
