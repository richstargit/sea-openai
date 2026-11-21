# SnapPromo frontend

Run these commands from the `frontend` directory. Install dependencies with `npm ci` on a fresh checkout.

## Development

```bash
npm run dev
```

Open http://localhost:3000. Changes appear automatically. Development mode does not create a production build.

## Production preview

```bash
npm start
```

The `prestart` lifecycle runs `npm run build` first, then starts the production server. A failed build stops startup rather than serving missing or outdated output. This also works on a fresh checkout without a `.next` directory. The build downloads the Inter and Noto Sans Thai fonts and needs internet access.

For deployment systems that build separately, run `npm run build` during the build phase and `npx next start` during the run phase.

Production builds use Webpack and development uses Turbopack. Both compile Tailwind through PostCSS.

## Class name utility

`lib/utils.ts` defines `cn` using the installed `clsx` and `tailwind-merge` packages. Import it from `@/lib/utils`; no separate `cn` package is needed.

## Video editor

Open http://localhost:3000/editor, or choose **Open in editor** from a Studio result. The first visit opens an editable three-shot sample; use **My projects → New project** for a blank timeline. Import videos, photos or audio with the plus button or drag and drop.

Select a clip, then use the icon tabs for text, audio, image adjustments, framing and dimensions. Drag clip edges to trim and drag clips to reorder them. Space plays/pauses, S splits at the playhead, Delete closes the gap, and Cmd/Ctrl+Z undoes. Edits and media are saved to MongoDB under the signed-in account. Under **My projects → Import from this browser**, choose an older device project to copy to your account.

**Export MP4** renders the edited timeline locally using H.264 video and AAC audio when present. Codec availability and maximum size depend on the browser. Unsupported configurations show an error. Keep the tab open until export completes.

The FilmCraft source adaptation, licensing and supported scope are documented in [docs/filmcraft.md](docs/filmcraft.md). The supplied design skill is preserved in [docs/design/apple-design.md](docs/design/apple-design.md).

Run the timeline tests with `npm run test:editor`. For browser tests, start the frontend on localhost:3000 and the backend with MongoDB on a dedicated test database, install Chromium with `npx playwright install chromium`, then run `npm run test:editor:browser`. Set `EDITOR_BASE_URL` to use another development server.
