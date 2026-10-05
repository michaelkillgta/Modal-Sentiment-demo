# Modal Sentiment AI — backend

A single CPU-only Modal web function that turns text into a sentiment prediction.

```
POST  {"text": "I absolutely love this product!"}
  ↓
{"label": "POSITIVE", "confidence": 0.9998}
```

Everything lives in [`modal_app.py`](modal_app.py) — that file *is* the deployment
(there is no requirements file to install on the server, no Dockerfile, and no
server to keep running).

## What the file defines

| Piece | What it does |
| --- | --- |
| `image` | The container environment: Debian slim + Python 3.12, CPU-only PyTorch, Transformers, FastAPI. |
| `app = modal.App("modal-sentiment-demo")` | The Modal app these resources are grouped under. |
| `SentimentModel` (`@app.cls`) | A class whose `@modal.enter` hook loads the model once per container. |
| `SentimentModel.predict` | The HTTP endpoint, created by `@modal.fastapi_endpoint(method="POST")`. |

### Why the class and `@modal.enter`?

`@modal.enter()` runs exactly once when a container starts, *before* the first
request is handled. That is where the DistilBERT model is downloaded from the
Hugging Face Hub and loaded into memory. Modal then reuses that same container
for the next few requests, so the model is **not** re-downloaded per request.

When the app is idle, Modal shuts the container down (see the cost knobs below).
The next request after that starts a fresh container and briefly waits for the
cold start — that first request is slower, later ones are fast.

### Why CPU-only PyTorch?

`distilbert-base-uncased-finetuned-sst-2-english` is a 67M-parameter model. On one
CPU core a short sentence is classified in well under a second, so a GPU would
only add cost. Two things keep this honest:

* No `gpu=` argument is passed anywhere, so this app cannot land on a GPU.
* PyTorch is installed from its CPU-only wheel index
  (`https://download.pytorch.org/whl/cpu`). A plain `pip install torch` on Linux
  would drag in multi-gigabyte CUDA wheels that we would never use.

## Setup (once)

```bash
python -m pip install modal        # the Modal Python client + CLI
python -m modal setup              # opens the browser to log in
```

Use the `python -m modal ...` form if plain `modal` is not recognised by your shell.
That happens on Windows when the CLI lands in a Python `Scripts` folder that is not on
PATH — `python -m modal` always works because it goes through the interpreter. Every
`modal ...` command on this page has a `python -m modal ...` equivalent.

`modal setup` creates a token in `~/.modal.toml`. You need a Modal account
(https://modal.com) — the free tier is enough for this demo.

## Deploy

Run this **from the `backend/` directory**:

```bash
python -m modal deploy modal_app.py
```

The build installs the image (a few minutes the first time, seconds afterwards
because image layers are cached), then prints something like:

```
✓ Created objects.
├── 🔨 Created web function predict => https://<your-workspace>--modal-sentiment-demo-sentimentmodel-predict.modal.run
└── ✓ Web Function predict => https://...modal.run
```

**Copy that URL** — it is your `MODAL_ENDPOINT`. The slug is built from the app, class and
method names (hence `modal-sentiment-demo` and `sentimentmodel`), so never assemble it by
hand. You can always look it up again:

```bash
python -m modal app info modal-sentiment-demo
```

Use the `…modal.run` **function** URL. The `https://modal.com/apps/…` dashboard URL is an
HTML page and will reject a POST.

> Want to iterate without deploying a permanent app? Use `modal serve modal_app.py`.
> That creates a temporary dev URL with live reload. It keeps running (and
> billing) until you press `Ctrl-C`, so stop it when you are done.

## Test the endpoint manually

```bash
export MODAL_ENDPOINT="https://<your-workspace>--modal-sentiment-demo-sentimentmodel-predict.modal.run"

curl -X POST "$MODAL_ENDPOINT" \
  -H 'Content-Type: application/json' \
  -d '{"text": "I absolutely love this product!"}'
```

Expected:

```json
{"label": "POSITIVE", "confidence": 0.9998}
```

Try a negative sentence, then check the error handling:

```bash
# NEGATIVE
curl -X POST "$MODAL_ENDPOINT" -H 'Content-Type: application/json' \
  -d '{"text": "This product is terrible."}'

# 400 — empty text
curl -i -X POST "$MODAL_ENDPOINT" -H 'Content-Type: application/json' \
  -d '{"text": "   "}'

# 413 — longer than 500 characters
curl -i -X POST "$MODAL_ENDPOINT" -H 'Content-Type: application/json' \
  -d "{\"text\": \"$(python -c 'print("a" * 501)')\"}"
```

| Situation | Status | Body |
| --- | --- | --- |
| Valid request | `200` | `{"label": "POSITIVE"\|"NEGATIVE", "confidence": 0.0–1.0}` |
| Missing / non-string / empty `text` | `400` | `{"error": "..."}` |
| `text` longer than 500 characters | `413` | `{"error": "..."}` |
| Body is not a JSON object (FastAPI validation) | `422` | FastAPI's standard error body |

The first request after idle time takes a few extra seconds (cold start +
model download). Later requests reuse the warm container.

## Logs

```bash
modal app logs modal-sentiment-demo          # last 100 entries
modal app logs modal-sentiment-demo -f        # live stream (Ctrl-C to stop)
```

## Clean up

The app scales to zero on its own, so there is nothing to keep running. If you
want it gone completely:

```bash
modal app stop modal-sentiment-demo
```

## Optional: make cold starts faster

Every fresh container re-downloads the model (~268 MB). If you want to avoid
that, bake the weights into the image at build time by adding this before the
`@app.cls` definition:

```python
def _download_model() -> None:
    from huggingface_hub import snapshot_download

    snapshot_download(MODEL_ID)

image = image.run_function(_download_model)
```

`run_function` executes that code during the image build and saves the resulting
filesystem as an image layer, so containers start with the weights already on
disk. It costs a little build time once and makes cold starts noticeably faster.
It is deliberately **not** included here, to keep the demo small.

## Cost knobs in this app

| Setting | Value | Why |
| --- | --- | --- |
| `cpu` | `1.0` | One core classifies a sentence in well under a second. |
| `memory` | `2048` MiB | Comfortable headroom for PyTorch + the model. |
| `timeout` | `60` s | A stuck request cannot run (and bill) for long. |
| `min_containers` | `0` | Nothing is kept warm while idle. |
| `max_containers` | `1` | A burst of test requests cannot fan out into many containers. |
| `scaledown_window` | `60` s | Idle containers are shut down quickly. |

See the "Keeping this experiment cheap" section in the [project README](../README.md).
