# Cloudflare Pages + R2 Demo Assets

Use Cloudflare Pages for the Math3D web app and Cloudflare R2 for heavy demo
assets. This avoids repeated GitHub LFS downloads during Pages builds.

## Cloudflare Setup

Create one R2 bucket:

```text
math3d-demo-assets
```

Expose it with a public custom domain or public bucket URL. Use the public URL
as the asset base, including the version prefix:

```text
https://assets.example.com/math3d-demo/v1/
```

In the Cloudflare Pages project, set these environment variables for production
and preview builds:

```text
GIT_LFS_SKIP_SMUDGE=1
MATH3D_SKIP_LOCAL_GALLERY_ASSET_COPY=1
VITE_MATH3D_ASSET_BASE_URL=https://assets.example.com/math3d-demo/v1/
```

Keep the Pages build command as:

```text
npm run build:web:pages
```

The web build will still work locally without those variables; it will copy and
serve local gallery assets as before.

## Upload Assets

Log in to Wrangler once:

```powershell
npx wrangler login
```

Preview the upload:

```powershell
npm run r2:upload:demo-assets -- --bucket math3d-demo-assets --prefix math3d-demo/v1 --dry-run
```

Upload:

```powershell
npm run r2:upload:demo-assets -- --bucket math3d-demo-assets --prefix math3d-demo/v1
```

The script uploads:

- `gallery-images/captured/**` to `math3d-demo/v1/gallery-images/captured/**`
- `renderer/public/mesh-presets/**` to `math3d-demo/v1/mesh-presets/**`

Files are uploaded with:

```text
Cache-Control: public, max-age=31536000, immutable
```

For changed assets, use a new prefix such as `math3d-demo/v2` and update
`VITE_MATH3D_ASSET_BASE_URL` in Cloudflare Pages.

## Why This Helps

Cloudflare Pages no longer needs to pull GitHub LFS payloads for every build.
The app shell stays in Git, while large and generated demo assets are served
from R2.
