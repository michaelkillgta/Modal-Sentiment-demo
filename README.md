# Modal Sentiment AI

A tiny educational demo of one idea:

> A browser sends text to a Python AI function running remotely on Modal. Modal loads a
> small pretrained sentiment model and returns the prediction.

Type a sentence, click **Analyze**, and get back `POSITIVE` or `NEGATIVE` with a
confidence score:

```
"I absolutely love this product!"   →  🟢 POSITIVE   Confidence: 100%
"This product is terrible."         →  🔴 NEGATIVE   Confidence: 100%
```

There is no database, no queue, no Docker, no cron job, no always-on server, no GPU, and
no large language model. It is one Python file, one web page, and one small model.

---

## Architecture

```text
Browser  (Next.js chat UI — frontend/)
   ↓   HTTP POST  {"text": "I absolutely love this product!"}
Modal HTTP endpoint  (@modal.fastapi_endpoint, CPU only)
   ↓
Python function  (SentimentModel.predict)
   ↓
DistilBERT  (Hugging Face Transformers, running on CPU)
   ↓   {"label": "POSITIVE", "confidence": 0.9998}
Browser  (result card with label, confidence and attribution)
```

---

## The pieces, explained

### What is Modal?

Modal is a cloud platform for running Python code. You write a normal Python function and
tell Modal what it needs (which packages, how much CPU, how much memory). Modal builds the
container, runs your function in the cloud when someone calls it, and shuts it back down
when it is idle. You never manage a server, and you are billed only for the seconds your
code is actually running.

That "only exists while it is working" behaviour is exactly what makes small AI demos like
this one cheap.

### Why is the model running remotely?

A browser cannot run PyTorch. If the model had to run locally you would need a Python
environment on every machine that opens the page, plus a server process that stays running
all day. Instead, the model lives in a Modal container in the cloud and the browser talks
to it over HTTPS:

* nothing heavy is installed on the visitor's machine,
* there is no server for you to keep alive, patch or pay for while idle,
* the exact same endpoint works from any browser, anywhere.

The trade-off is the **cold start**: when nobody has used the app for a while there is no
container running, so the first request waits a few seconds while Modal starts a container
and loads the model. Requests after that are fast, because Modal reuses the warm container
for a short window.

### Why CPU instead of GPU?

The model here is DistilBERT — a 67-million-parameter model, distilled down from BERT and
fine-tuned on short sentences. Classifying one short sentence takes well under a second on
a single CPU core, so a GPU would add cost and complexity for no visible benefit.

Two details keep this promise honest:

* No `gpu=` argument is passed anywhere in `backend/modal_app.py`, so this app cannot be
  scheduled onto a GPU.
* PyTorch is installed from its **CPU-only** wheel index
  (`https://download.pytorch.org/whl/cpu`). A plain `pip install torch` on Linux pulls
  multi-gigabyte CUDA wheels that would never be used.

### What does the sentiment model do?

The model is
[`distilbert/distilbert-base-uncased-finetuned-sst-2-english`](https://huggingface.co/distilbert/distilbert-base-uncased-finetuned-sst-2-english).

* *DistilBERT* is a smaller, faster version of BERT, trained by distilling the bigger model.
* It was fine-tuned on **SST-2** (Stanford Sentiment Treebank), a dataset of short
  movie-review sentences labelled positive or negative.
* For any input it outputs a probability over **two** classes: `POSITIVE` and `NEGATIVE`.
  The label with the higher probability is returned as the prediction, and that probability
  is the `confidence` value.

Important: this model has **no neutral class and no neutral score**. Everything you type
comes back as either POSITIVE or NEGATIVE, even when the text is neutral, sarcastic, or
factual. A confidence of `0.51` means the model barely prefers one label over the other —
it is not a calibrated measure of how strongly you feel about anything. It also cannot see
context beyond the sentence you give it, and it was never trained to detect emotion in
general, only review-style sentiment.

### How does the browser communicate with Modal?

`@modal.fastapi_endpoint(method="POST")` publishes the Python function at a public HTTPS
URL. The frontend sends one `fetch()` POST to that URL with a JSON body:

```json
{ "text": "I absolutely love this product!" }
```

Modal wraps the function in a FastAPI app, so the request body is parsed as JSON, invalid
bodies get a standard `422` response, and **CORS is enabled automatically** — which is why
the browser can call `*.modal.run` directly from `http://localhost:3000` without a proxy
layer. The response comes back as JSON:

```json
{ "label": "POSITIVE", "confidence": 0.9998 }
```

The backend deliberately returns friendly errors: `400` for empty or missing `text`, `413`
when the text is longer than 500 characters. The frontend shows those errors in the chat
instead of failing silently.

---

## Project structure

```text
modal-sentiment-demo/
├── backend/
│   ├── modal_app.py        # the whole backend: image, model loading, HTTP endpoint
│   ├── requirements.txt    # the same dependencies, for local installs/inspection
│   └── README.md           # backend details: lifecycle, deploying, curl tests
│
├── frontend/
│   ├── app/                # Next.js App Router: layout, page, styles
│   ├── components/         # chat UI + result card
│   ├── lib/api.ts          # the single POST request to Modal
│   ├── .env.example        # copy to .env.local and paste your endpoint URL
│   └── README.md           # frontend details
│
└── README.md               # you are here
```

---

## Setup and run

You need a [Modal account](https://modal.com), Python 3.10+ and Node.js 20.9+.

### 1. Deploy the backend

```bash
cd backend
python -m pip install modal        # installs the Modal client and the CLI
python -m modal setup              # once: opens your browser to log in
python -m modal deploy modal_app.py
```

Why `python -m modal` instead of plain `modal`? It runs the installed package
through your current Python, so it works no matter which folder the CLI ended up in.
If `modal` happens to be on your PATH, the shorter `modal setup` and
`modal deploy modal_app.py` are exactly equivalent — the rest of this README uses that
short form. On Windows this distinction matters: `pip install modal` usually puts
`modal.exe` in a Python `Scripts` folder that is **not** on PATH, which is the usual
cause of `The term 'modal' is not recognized as the name of a cmdlet`.

If the install refuses to write to your Python folder, add `--user`
(`python -m pip install --user modal`) and keep using `python -m modal ...`.

`modal deploy` builds the image (a few minutes the first time, seconds after that, because
Modal caches image layers) and prints the URL of your web function:

```
✓ Created web function predict => https://<your-workspace>--modal-sentiment-demo-sentimentmodel-predict.modal.run
```

Copy that URL. The slug is derived from the app, class and method names, which is why it
contains both `modal-sentiment-demo` and `sentimentmodel`. Lost it? Look it up any time:

```bash
python -m modal app info modal-sentiment-demo
```

Watch out for the most common mix-up: you want the `…modal.run` **function** URL, not the
`https://modal.com/apps/…` **dashboard** URL from your browser. The dashboard page is HTML
and cannot accept a POST.

Want to iterate without deploying? `modal serve modal_app.py` gives you a temporary dev URL
with live reload. It keeps running until you press `Ctrl-C`, so stop it when you are done.

### 2. Start the frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # then paste your Modal URL into .env.local
npm run dev
```

`.env.local` is only read on your machine. Next.js also loads a plain `.env` file, so either
one works — `.env.local` wins when both exist.

Open http://localhost:3000, type a sentence (or click one of the example prompts) and press
**Analyze**.

`NEXT_PUBLIC_MODAL_ENDPOINT` is inlined when the dev server starts, so restart `npm run dev`
after changing it. The dev server is only needed while you are looking at the page — stop it
with `Ctrl-C` when you are done.

### 3. Test the endpoint manually

```bash
export MODAL_ENDPOINT="https://<your-workspace>--modal-sentiment-demo-sentimentmodel-predict.modal.run"

curl -X POST "$MODAL_ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{"text": "I absolutely love this product!"}'
```

```json
{"label": "POSITIVE", "confidence": 0.9998}
```

A negative example, then the error cases:

```bash
curl -X POST "$MODAL_ENDPOINT" -H 'Content-Type: application/json' \
  -d '{"text": "This product is terrible."}'

# 400 — empty text
curl -i -X POST "$MODAL_ENDPOINT" -H 'Content-Type: application/json' \
  -d '{"text": "   "}'

# 413 — more than 500 characters
curl -i -X POST "$MODAL_ENDPOINT" -H 'Content-Type: application/json' \
  -d "{\"text\": \"$(python -c 'print("a" * 501)')\"}"
```

More backend detail — logs, container lifecycle, the response contract — is in
[`backend/README.md`](backend/README.md).

---

## Keeping this experiment cheap

This demo was built to be as close to free as a cloud AI demo can be. Concretely:

* **CPU by design.** No GPU is requested anywhere, and PyTorch is installed from its
  CPU-only wheel index, so no CUDA wheels are downloaded or stored either. GPUs are the
  expensive part of cloud AI; this demo does not touch them.
* **No background work of any kind.** No polling, no request loops, no WebSocket, no
  cron/scheduled function, no queue, no worker, no database. The frontend sends exactly
  one request per click, and only when a human clicks.
* **It scales to zero.** `min_containers=0` (Modal's default) means no container is kept
  warm. A container exists only while it handles your request plus a short idle window
  (`scaledown_window=60`), then it is shut down.
* **It cannot fan out.** `max_containers=1` caps the app at a single container, so a burst
  of test clicks can never spin up a fleet.
* **Requests are capped.** `timeout=60` means nothing can run — or bill — for long.
* **The model loads once per container, not once per request.** `@modal.enter` loads
  DistilBERT at container startup, so the ~268 MB download does not repeat for every
  message.
* **Only a handful of manual requests.** Run the curl examples, try a few sentences in the
  UI, and stop. There is nothing here that keeps making calls on its own.

After testing:

* Check your usage and billing in the Modal dashboard — that is the only place the real
  numbers come from. No cost figure is quoted in this README because none has been measured
  on your workspace; Modal bills per second of actual usage.
* Look at what is deployed with `modal app list` (and `modal app dashboard
  modal-sentiment-demo` for this app).
* Make sure nothing is left running: press `Ctrl-C` if a `modal serve` session is still
  open, and stop the app entirely with:

  ```bash
  modal app stop modal-sentiment-demo
  ```

  A deployed-but-idle app costs nothing, but stopping it guarantees there is nothing to
  forget about.

Useful commands while testing (`python -m modal ...` also works for every one of them):

```bash
modal app logs modal-sentiment-demo       # recent logs (use -f to stream)
modal app list                            # what is running / deployed / recently stopped
modal app stop modal-sentiment-demo       # remove the app and its containers
```

---

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| UI says `NEXT_PUBLIC_MODAL_ENDPOINT is not set` | Copy `.env.example` to `.env.local` (or `.env`), paste your Modal URL, restart `npm run dev`. |
| `Could not reach the Modal endpoint` | Wrong URL, or the app is not deployed. It must be the `…modal.run` **function** URL — the `modal.com/apps/…` dashboard URL is an HTML page and rejects POSTs. Check with `python -m modal app info modal-sentiment-demo`. |
| First request takes several seconds | Normal cold start: Modal is starting a container and loading the model. Later requests are fast. |
| `HTTP 413` | Your text is longer than the 500-character limit. |
| `HTTP 422` | The request body was not a JSON object, e.g. the `text` field was missing or the body was malformed. |
| `modal deploy` fails while building the image | Re-run it and read the build log; a transient network error while downloading packages is the usual cause. |
| `modal : The term 'modal' is not recognized` (Windows) | The CLI is installed, but its `Scripts` folder is not on your PATH. Run the same command as `python -m modal setup`, `python -m modal deploy modal_app.py`, and so on. |

---

## What this demo is not

It is a teaching example, not a product: there is no authentication, no rate limiting, no
input sanitisation beyond length limits, no persistence, and no monitoring. Anyone with the
URL can call the endpoint. If you build on it, those are the first things to add.
