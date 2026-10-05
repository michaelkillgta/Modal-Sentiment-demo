"use client";

import { useState } from "react";

import ResultCard from "@/components/ResultCard";
import {
  analyzeSentiment,
  endpointHost,
  HAS_ENDPOINT,
  MAX_CHARS,
  type AnalyzeResult,
} from "@/lib/api";

const EXAMPLES = [
  "I absolutely love this!",
  "This product is terrible.",
  "The experience was amazing.",
  "I would not recommend this.",
];

export default function SentimentChat() {
  const [text, setText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  const characters = text.trim().length;
  const isEmpty = characters === 0;
  const isTooLong = characters > MAX_CHARS;

  /** Sends exactly one request. Called only from a click or a form submit. */
  async function analyze(value: string) {
    const trimmed = value.trim();
    if (isLoading || trimmed.length === 0) {
      return;
    }

    setIsLoading(true);
    setResult(null);

    const next = await analyzeSentiment(trimmed);

    setResult(next);
    setIsLoading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/40 backdrop-blur sm:p-6">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            analyze(text);
          }}
          className="flex flex-col gap-3"
        >
          <label htmlFor="text" className="text-sm font-medium text-slate-200">
            Your text
          </label>

          <textarea
            id="text"
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="I absolutely love this product!"
            className="w-full resize-y rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/25 focus:outline-none"
          />

          <div className="flex items-center justify-between gap-3">
            <span
              className={`font-mono text-xs ${
                isTooLong ? "text-amber-400" : "text-slate-500"
              }`}
            >
              {characters} / {MAX_CHARS}
            </span>

            <button
              type="submit"
              disabled={isEmpty || isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 focus:ring-2 focus:ring-indigo-400/40 focus:outline-none disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-slate-500"
            >
              {isLoading && (
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                />
              )}
              {isLoading ? "Analyzing…" : "Analyze"}
            </button>
          </div>

          {isTooLong && (
            <p className="text-xs text-amber-400">
              Over the {MAX_CHARS}-character limit — the backend will reject this with
              HTTP 413.
            </p>
          )}
        </form>

        <div className="mt-5 border-t border-white/5 pt-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
            Try an example
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                disabled={isLoading}
                onClick={() => {
                  setText(example);
                  analyze(example);
                }}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-indigo-400/40 hover:bg-indigo-500/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </section>

      {isLoading && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl shadow-black/40 sm:p-6">
          <p className="text-sm text-slate-300">Sending one POST request to Modal…</p>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-white/10" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            The first request after an idle period waits for a cold start — Modal has to
            start a container and load the model.
          </p>
        </section>
      )}

      {!isLoading && result?.ok === true && (
        <ResultCard sentiment={result.sentiment} latencyMs={result.latencyMs} />
      )}

      {!isLoading && result?.ok === false && (
        <section
          role="alert"
          className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 shadow-xl shadow-amber-950/40 sm:p-6"
        >
          <p className="text-sm font-semibold text-amber-300">
            {result.status ? `The Modal backend returned HTTP ${result.status}` : "Request failed"}
          </p>
          <p className="mt-1 text-sm text-amber-100/80">{result.message}</p>
        </section>
      )}

      <RequestFlow />
    </div>
  );
}

/** Small explainer so it is obvious where the prediction actually happened. */
function RequestFlow() {
  const steps = ["Browser", "Modal endpoint (CPU)", "Python function", "DistilBERT", "Result"];

  return (
    <section className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-xs text-slate-400">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-slate-300">
        POST{" "}
        <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-indigo-300">
          {HAS_ENDPOINT ? endpointHost() : "NEXT_PUBLIC_MODAL_ENDPOINT not set"}
        </code>
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
        {steps.map((step, index) => (
          <span key={step} className="flex items-center gap-2">
            <span className="rounded-md bg-white/5 px-2 py-1">{step}</span>
            {index < steps.length - 1 && <span className="text-slate-600">↓</span>}
          </span>
        ))}
      </div>

      <p className="mt-3">
        One request per click. Nothing is polled and nothing runs in the background — the
        Modal container only exists while it is handling your request, then shuts down.
      </p>
    </section>
  );
}
