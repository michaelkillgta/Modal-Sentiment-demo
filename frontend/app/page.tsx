import SentimentChat from "@/components/SentimentChat";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-8 text-center sm:mb-10">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          DistilBERT · CPU only · Serverless
        </span>

        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Modal Sentiment AI
        </h1>

        <p className="mt-3 text-sm text-slate-400 sm:text-base">
          A tiny AI model running remotely on Modal
        </p>
      </header>

      <SentimentChat />

      <p className="mt-8 text-center text-xs text-slate-500">
        Your text goes straight from this browser to a Modal web function, is classified on
        CPU, and comes back as a label with a confidence score.
      </p>
    </main>
  );
}
