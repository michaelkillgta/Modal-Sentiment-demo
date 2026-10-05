"""Modal Sentiment AI — backend.

One tiny CPU-only web function: it takes a short piece of text, runs it through a
small pretrained DistilBERT sentiment model, and returns POSITIVE or NEGATIVE
plus a confidence score.

Deploy (from this `backend/` directory):

    modal setup          # once, to authenticate
    modal deploy modal_app.py

Test:

    curl -X POST "$MODAL_ENDPOINT" \\
      -H 'Content-Type: application/json' \\
      -d '{"text": "I absolutely love this product!"}'

Cost safety, on purpose:
  * CPU only. No GPU is requested anywhere in this file.
  * No database, no queue, no cron, no long-running server process.
  * The model is loaded once per container (`@modal.enter`), not per request.
  * min_containers=0 (the Modal default) means the app scales to zero when idle.
  * max_containers=1 stops a burst of test requests from fanning out.
  * timeout=60 caps a stuck request so nothing can churn on your bill.
"""

import modal

APP_NAME = "modal-sentiment-demo"

# A small (~268 MB) binary classifier fine-tuned on SST-2.
# NOTE: this model only knows POSITIVE and NEGATIVE. It has no "neutral" class.
MODEL_ID = "distilbert/distilbert-base-uncased-finetuned-sst-2-english"

# Keep inputs short: this is a demo, not a document classifier.
MAX_CHARS = 500

# PyTorch publishes CPU-only wheels on its own index. Installing `torch` from
# PyPI would pull multi-gigabyte CUDA wheels we will never use, so we point this
# one layer at the CPU build instead.
CPU_TORCH_INDEX = "https://download.pytorch.org/whl/cpu"

image = (
    modal.Image.debian_slim(python_version="3.12")
    # CPU-only PyTorch (no CUDA wheels).
    .uv_pip_install("torch", index_url=CPU_TORCH_INDEX)
    # `fastapi` is required by @modal.fastapi_endpoint; transformers brings the
    # tokenizer + model loading code.
    .uv_pip_install("transformers>=4.44,<6", "fastapi[standard]")
)

app = modal.App(APP_NAME)


class InvalidInput(Exception):
    """Raised for bad input, carrying the HTTP status we want to return."""

    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def validate_text(raw: object) -> str:
    """Check the request body's `text` field and return the cleaned string."""
    if not isinstance(raw, str):
        raise InvalidInput(400, "Expected a JSON object like {\"text\": \"hello\"} with a string 'text' field.")
    text = raw.strip()
    if not text:
        raise InvalidInput(400, "Field 'text' must not be empty.")
    if len(text) > MAX_CHARS:
        raise InvalidInput(
            413,
            f"Field 'text' must be at most {MAX_CHARS} characters (got {len(text)}).",
        )
    return text


@app.cls(
    image=image,
    cpu=1.0,  # one CPU core is plenty for a 67M-parameter model
    memory=2048,  # MiB
    timeout=60,
    # Cost-safety knobs: nothing stays warm, and only one container can ever run.
    min_containers=0,
    max_containers=1,
    scaledown_window=60,
)
class SentimentModel:
    """Loads the model once per container, then serves predictions over HTTP."""

    @modal.enter()
    def load_model(self) -> None:
        """Runs once when a container starts, before the first request arrives.

        Container lifecycle is how we avoid downloading and loading the model on
        every request: `@modal.enter` is called on container startup, and Modal
        reuses that container for a short while afterwards.
        """
        from transformers import pipeline

        # device="cpu" pins inference to the CPU. There is no GPU in this app at all.
        self.classifier = pipeline(
            task="sentiment-analysis",
            model=MODEL_ID,
            device="cpu",
        )
        print(f"Loaded {MODEL_ID} on CPU.")

    @modal.fastapi_endpoint(method="POST")
    def predict(self, payload: dict):
        """POST a JSON body like {"text": "..."} and get back a sentiment."""
        # Imported here (not at module level) so that `modal deploy` works without
        # fastapi installed on your machine — this import lives in the container.
        from fastapi.responses import JSONResponse

        try:
            text = validate_text((payload or {}).get("text"))
        except InvalidInput as err:
            return JSONResponse(status_code=err.status_code, content={"error": err.message})

        prediction = self.classifier(text)[0]  # e.g. {"label": "POSITIVE", "score": 0.9998}

        return {
            "label": str(prediction["label"]).upper(),
            "confidence": round(float(prediction["score"]), 4),
        }
