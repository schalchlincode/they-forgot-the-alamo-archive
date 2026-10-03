# They Forgot the Alamo development archive

The public-facing archive is a static Astro site. Entries and evidence references live in portable `src/journal/*.md` files. `src/data/entries.ts` derives the shared page data from these files. Original captures stay in the game tree; `scripts/prepare_media.py` writes web copies to `public/media/` and records their source in `metadata.json`.

## Local build

From `site/`, run `npm install`, then `npm run build` or `npm run dev`. The game's editable source stays in the parent directory; its self-contained web copy and required assets are published from `public/game/`.

## Playable web build

The archive's Play page links to `/game/`. When updating the game, copy `index.html`, `main.js`, `ps1-settings.js`, the required `assets/models/`, `audio/`, and `vendor/` files into `public/game/`. Keep the Three.js license notice with the vendored modules. Build with the repository path set (the Pages workflow does this automatically), and test the standalone game in a real browser before publishing.

## Adding a meaningful change

1. Commit and test the game change first. Preserve any old model or screenshot that shows a meaningful intermediate state.
2. Capture a real browser scene using the game's existing Playwright routes; record whether it is a capture at the time or a later reconstruction. Never label a later capture as an original historical screenshot.
3. Add one evidence-linked Markdown entry to `src/journal/` for a coherent change, rather than one per tiny commit. Use the local date of the Git commit unless a better dated record exists.
4. Add selected media to `scripts/prepare_media.py`, run it, inspect the output, and build the site. A new capture needs a new filename; never overwrite archival originals.
5. Audit the exact staged files for secrets and unrelated personal material before any public push. Build and browser-test desktop and mobile pages.

### Writing future entries

Write this as Geoff's project journal. He directs the game, requests changes, tests builds, and makes creative choices; AI coding tools do much of the coding and technical implementation. Explain that division once on the About page, not in every entry. Use first person only for a wish, request, reaction, test, or creative decision supported by a dated owner message or other direct record. Describe code, models, settings, and fixes as changes to the build, without assigning Geoff technical work or a rationale that the record does not show. Do not turn a commit into a supposed quote, feeling, anecdote, or intention. If ownership or motive is uncertain, state the observable change and cite its source. Keep the dates, features, failed experiments, screenshot provenance, and meaningful milestones. Write casually and specifically; avoid hype, corporate language, and generic AI prose. Check titles, summaries, body copy, and surrounding page copy against these rules before publishing.

The dedicated GitHub repository contains only this audited site; it does not include the private MechaJeeves parent repository or its Git history. The included `.github/workflows/pages.yml` builds and deploys the static site from `main`. In GitHub repository Settings → Pages, select **GitHub Actions** as the build source. The build reads `GITHUB_REPOSITORY` and prefixes links and assets for project Pages at `https://OWNER.github.io/REPOSITORY/`. Local builds use root paths. The archive is published through GitHub Pages, and the standalone game lives at `/game/` beneath the repository path.

Before publication, review the exact site-only files, images, journal copy, third-party license notices, Git author identity, and repository visibility. The browser evidence and `dist/` are local test output and should not be included in the public source repository.

## Historical captures

`scripts/recover_history.py` extracts only the game directory from selected commits into temporary directories, serves each extracted version on loopback, and takes a real Edge screenshot. It refuses to overwrite existing captures. Originals and `captures/historical/metadata.json` live under the game tree; `prepare_media.py` creates smaller site copies. The first two recovered states are commits `bf4a988` (September 29) and `14c3825` (September 30). Their screenshots were reconstructed on October 1, not captured when those versions were first made. Review the image and browser errors before adding another commit to the script.

## Browser evidence

After `npm run build`, run `python scripts/verify_site.py` from this directory. It serves only `dist/` on loopback and checks every generated page at desktop, phone, and tablet sizes, decoded images, internal links, gallery-to-entry associations, actual tag filtering, navigation clicks, console errors, and horizontal overflow. Each successful run saves a timestamped report and nine website screenshots under `browser-evidence/`; older evidence is never overwritten. A test failure is not a deployment approval.

`browser-evidence/` contains full-page desktop and phone screenshots of the local site. The game original is preserved separately at `../captures/2026-10-01-current-room.png`; `public/media/current-room.webp` is its optimized site copy. A local Playwright Chromium check loaded the homepage, devlog, timeline, gallery, About, Play, and two individual entries at 1440x900 and 390x844. All returned HTTP 200, images decoded, no page error occurred, and no horizontal overflow was detected. The game loaded with a canvas and no page error at 1280x720. This is local browser evidence, not proof of public deployment or complete gameplay verification.

Design references inspected: [Factorio Friday Facts](https://www.factorio.com/blog/) for a browsable, image-rich long-running log; [Subnautica's early development blog](https://unknownworlds.com/en/news/welcome-to-the-subnautica-blog) for candid failures and breakthroughs; and [No Man's Sky's before/after update](https://www.nomanssky.com/2018/09/development-update-1-61/) for visual comparison as a storytelling device. The site's layout and styling are original to this project.
