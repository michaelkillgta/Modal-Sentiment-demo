import type { SentimentResult } from "@/lib/api";

type Props = {
  sentiment: SentimentResult;
  /** Browser-measured round trip to the Modal endpoint, in milliseconds. */
  latencyMs: number;
};

export default function ResultCard({ sentiment, latencyMs }: Props) {
  const isPositive = sentiment.label === "POSITIVE";
  const percent = Math.round(sentiment.confidence * 100);

  return (
    <section
      aria-live="polite"
      className={`rounded-2xl border p-5 shadow-xl backdrop-blur sm:p-6 ${
        isPositive
          ? "border-emerald-400/30 bg-emerald-500/10 shadow-emerald-950/40"
          : "border-rose-400/30 bg-rose-500/10 shadow-rose-950/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-2xl leading-none">
          {isPositive ? "🟢" : "🔴"}
        </span>
        <p
          className={`text-2xl font-semibold tracking-tight sm:text-3xl ${
            isPositive ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {sentiment.label}
        </p>
      </div>

      <p className="mt-4 text-sm text-slate-300">
        Confidence:{" "}
        <span className="text-base font-semibold text-white">{percent}%</span>{" "}
        <span className="text-slate-500">(score {sentiment.confidence.toFixed(4)})</span>
      </p>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${isPositive ? "bg-emerald-400" : "bg-rose-400"}`}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Predicted by DistilBERT in a Modal container on CPU, {latencyMs} ms round trip
        from this browser.
      </p>

      <p className="mt-1 text-xs text-slate-500">
        This model is a binary positive/negative classifier — it has no neutral class,
        so every input comes back as POSITIVE or NEGATIVE.
      </p>
    </section>
  );
}
