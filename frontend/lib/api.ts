/**
 * The only place the demo talks to the network.
 *
 * The browser sends exactly one POST request per click — no polling, no
 * background requests, no WebSocket. That is deliberate: it keeps the Modal
 * experiment cheap.
 */

export type SentimentLabel = "POSITIVE" | "NEGATIVE";

export type SentimentResult = {
  label: SentimentLabel;
  /** Model confidence, 0..1. */
  confidence: number;
};

/** Mirrors MAX_CHARS in backend/modal_app.py — the backend enforces it too. */
export const MAX_CHARS = 500;

/** URL of the deployed Modal web function, set in .env.local */
export const MODAL_ENDPOINT = (process.env.NEXT_PUBLIC_MODAL_ENDPOINT ?? "")
  .trim()
  .replace(/\/+$/, "");

export const HAS_ENDPOINT = MODAL_ENDPOINT.length > 0;

/**
 * Modal's dashboard pages live under modal.com/apps/... They look plausible when you
 * copy a URL out of the browser, but they are HTML pages and cannot accept a POST.
 */
export const LOOKS_LIKE_DASHBOARD_URL = MODAL_ENDPOINT.includes("modal.com/apps/");

export type AnalyzeResult =
  | { ok: true; sentiment: SentimentResult; latencyMs: number }
  | { ok: false; message: string; status?: number };

/** The host shown in the UI, e.g. "your-workspace--modal-sentiment-demo-predict.modal.run". */
export function endpointHost(): string {
  try {
    return new URL(MODAL_ENDPOINT).host;
  } catch {
    return MODAL_ENDPOINT;
  }
}

function isSentimentResult(value: unknown): value is SentimentResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.label === "POSITIVE" || candidate.label === "NEGATIVE") &&
    typeof candidate.confidence === "number"
  );
}

function describeHttpError(status: number, body: unknown): string {
  if (typeof body === "object" && body !== null) {
    const payload = body as Record<string, unknown>;
    if (typeof payload.error === "string") {
      return payload.error;
    }
    if (typeof payload.detail === "string") {
      return payload.detail;
    }
  }
  return `The Modal endpoint replied with HTTP ${status}.`;
}

export async function analyzeSentiment(text: string): Promise<AnalyzeResult> {
  if (!HAS_ENDPOINT) {
    return {
      ok: false,
      message:
        "NEXT_PUBLIC_MODAL_ENDPOINT is not set. Copy .env.example to .env.local (or .env) and paste the URL printed by `modal deploy`.",
    };
  }

  if (LOOKS_LIKE_DASHBOARD_URL) {
    return {
      ok: false,
      message:
        "That is the Modal dashboard URL (modal.com/apps/...), which is a web page, not your endpoint. Use the ...modal.run URL printed by `modal deploy`, or look it up with `python -m modal app info modal-sentiment-demo`.",
    };
  }

  const startedAt = Date.now();

  try {
    const response = await fetch(MODAL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    const latencyMs = Date.now() - startedAt;
    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: describeHttpError(response.status, body),
      };
    }

    if (!isSentimentResult(body)) {
      return {
        ok: false,
        status: response.status,
        message: "The endpoint returned an unexpected response shape.",
      };
    }

    return { ok: true, sentiment: body, latencyMs };
  } catch {
    return {
      ok: false,
      message:
        "Could not reach the Modal endpoint. Check that it is deployed and that NEXT_PUBLIC_MODAL_ENDPOINT matches the URL Modal printed.",
    };
  }
}
