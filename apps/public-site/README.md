# Public Site

Standalone public-facing website for promoting Math3D.

## Local development

```bash
npm run dev:public-site
```

Server:

- `http://127.0.0.1:4321`

## Build

```bash
npm run build:public-site
```

Output:

- `apps/public-site/dist/`

## Preview built output

```bash
npm run preview:public-site
```

## Cloudflare Pages setup

- Project root: repository root (`Math3D`)
- Build command: `npm run build:public-site`
- Build output directory: `apps/public-site/dist`
