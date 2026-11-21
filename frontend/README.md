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

Production builds use Webpack because the Turbopack CSS loader cannot spawn its worker in some restricted environments. Development still uses Turbopack for fast refresh.

## Class name utility

`lib/utils.ts` defines `cn` using the installed `clsx` and `tailwind-merge` packages. Import it from `@/lib/utils`; no separate `cn` package is needed.
