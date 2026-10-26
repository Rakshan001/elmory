# Elmory website

The landing page and docs for Elmory, built with Next.js, Tailwind and shadcn/ui.
It has its own `package.json`; nothing here ships in the `elmory` npm package.

```bash
cd site
npm install
npm run dev     # http://localhost:3000
npm run build   # static production build
```

Set `NEXT_PUBLIC_SITE_URL` to the deployed URL so canonical links, the sitemap and robots.txt point at it.
