# Modal Sentiment AI — frontend

A one-page Next.js chat UI that sends your text to the Modal backend and shows the
sentiment it gets back.

```
app/
  layout.tsx            fonts + metadata
  page.tsx              title, subtitle, footer
  globals.css           Tailwind import + page background
components/
  SentimentChat.tsx     input, Analyze button, loading state, examples, errors
  ResultCard.tsx        the sentiment result (label, confidence, attribution)
lib/
  api.ts                the single POST request to the Modal endpoint
```

## 1. Point it at your deployment

Copy the example env file and paste the URL that `modal deploy` printed:

```bash
cp .env.example .env.local
```

```bash
NEXT_PUBLIC_MODAL_ENDPOINT=https://your-workspace--modal-sentiment-demo-sentimentmodel-predict.modal.run
```

Use the `…modal.run` **function** URL — the `modal.com/apps/…` dashboard URL is an HTML page
and will reject a POST. Look yours up with:

```bash
python -m modal app info modal-sentiment-demo
```

A plain `.env` file works too; `.env.local` just takes precedence when both exist.
`NEXT_PUBLIC_*` variables are inlined at build time, so restart the dev server after
changing this file.

## 2. Run it

```bash
npm install        # already done if you just scaffolded
npm run dev
```

Open http://localhost:3000, type something, and hit **Analyze**.

## Notes

* The browser calls the Modal endpoint **directly** — there is no Next.js API route
  and no server-side proxy. `@modal.fastapi_endpoint` enables CORS, so the cross-origin
  POST from `localhost:3000` to `*.modal.run` is allowed.
* One click = one request. There is no polling, no retry loop and no background traffic.
* The first request after the app has been idle is slower: Modal starts a container and
  loads the model. That is the cold start, and it is normal.
* If the endpoint URL is missing or wrong, the UI explains what to fix instead of failing
  silently — including the case where a Modal *dashboard* URL was pasted by mistake.

## Scripts

```bash
npm run dev      # dev server on http://localhost:3000
npm run build    # production build
npm run lint     # eslint
```
