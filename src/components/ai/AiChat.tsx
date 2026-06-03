"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AiResponse {
  url?: string | null;
  message?: string | null;
  error?: string;
}

// SpeechRecognition typings are nonstandard across browsers and aren't in
// the default lib.dom; lightweight any-typing here keeps it portable.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
}
type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};


function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function AiChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Auto-submit only when the engine ends the session on its own.
  // Flipped to false when the user manually taps mic-off, since they
  // may want to edit the transcript before sending.
  const autoSubmitOnEndRef = useRef(false);
  // Stable refs so the speech callbacks don't capture stale state.
  const inputRef = useRef("");
  const sendRef = useRef<(text: string) => void>(() => {});

  const speechSupported = useMemo(() => getSpeechRecognitionCtor() !== null, []);

  const currentUrl = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, open, pending]);

  // Keep input ref in sync so the SpeechRecognition callbacks can read
  // the latest typed/transcribed value without stale-closure bugs.
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || pending) return;
      setError(null);
      const next: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(next);
      setInput("");
      setPending(true);
      try {
        const res = await fetch("/api/ai/route", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messages: next, currentUrl }),
        });
        const data: AiResponse = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Something went wrong.");
          return;
        }
        if (data.message) {
          setMessages((m) => [
            ...m,
            { role: "assistant", content: data.message ?? "" },
          ]);
        }
        if (data.url) {
          // Keep the panel open so the user can keep refining ("now add
          // fastballs to this", "go to his last game") without re-opening
          // the chat after every navigation.
          router.push(data.url);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        setPending(false);
      }
    },
    [currentUrl, messages, pending, router],
  );

  // Mirror the latest send into a ref so voice-recognition callbacks
  // (configured once per session) can invoke the current closure.
  useEffect(() => {
    sendRef.current = (text: string) => {
      void send(text);
    };
  }, [send]);

  const toggleRecording = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    if (recording) {
      // Manual stop — don't auto-submit; the user might want to edit
      // the transcript before sending.
      autoSubmitOnEndRef.current = false;
      recognitionRef.current?.stop();
      return;
    }
    const rec = new Ctor();
    rec.lang = "en-US";
    // Single-shot recognition. Continuous mode interacts badly with
    // Android Chrome — it re-emits the same utterance as multiple
    // `isFinal=true` results, each one a progressively-longer
    // superset of the previous, producing stacked partials like
    // "show me show me Mason show me Mason Miller's...". Letting the
    // engine handle end-of-speech detection itself sidesteps that:
    // one tap = one recognition session = one final transcript.
    rec.continuous = false;
    rec.interimResults = false;
    // The engine ends the session on its own when the user stops
    // speaking, so we always want to submit whatever it produced
    // unless the user manually canceled by tapping mic-off.
    autoSubmitOnEndRef.current = true;

    // Whatever was in the input box when the user tapped mic acts as
    // a prefix; the engine-recognized text is appended to it.
    const baseInput = inputRef.current;

    rec.onresult = (ev) => {
      // Single-shot mode usually emits one final result. Walk the
      // list defensively in case the engine produces a couple of
      // disjoint chunks; the highest-index final has the engine's
      // best transcript so far.
      let finalText = "";
      for (let i = 0; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res?.isFinal) {
          finalText = (res[0]?.transcript ?? "").trim();
        }
      }
      if (!finalText) return;
      const combined = baseInput ? `${baseInput} ${finalText}` : finalText;
      inputRef.current = combined;
      setInput(combined);
    };

    rec.onerror = () => {
      autoSubmitOnEndRef.current = false;
      setRecording(false);
    };

    rec.onend = () => {
      setRecording(false);
      if (autoSubmitOnEndRef.current) {
        const text = inputRef.current.trim();
        if (text.length > 0) sendRef.current(text);
      }
      autoSubmitOnEndRef.current = false;
    };

    recognitionRef.current = rec;
    setRecording(true);
    rec.start();
  }, [recording]);

  const reset = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-cyan-400 text-white shadow-lg shadow-violet-500/30 transition hover:scale-105 active:scale-95"
        aria-label={open ? "Close AI chat" : "Open AI chat"}
      >
        <SparkleIcon />
      </button>

      {open && (
        <div className="fixed bottom-20 left-4 right-4 z-40 flex max-h-[70vh] flex-col rounded-xl border border-white/10 bg-[#0a0e14]/95 shadow-2xl backdrop-blur sm:right-auto sm:w-[420px]">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-400" />
              <span className="font-medium">Ask pitchtracker</span>
            </div>
            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="px-2.5 py-1.5 rounded-md text-[11px] uppercase tracking-[0.12em] text-white/65 hover:text-white hover:bg-white/[0.06] transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-white/[0.08] text-white/85 hover:text-white hover:bg-white/[0.16] transition-colors"
                aria-label="Close AI chat"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-3 text-sm"
          >
            {messages.length === 0 && (
              <div className="space-y-3 text-white/60">
                <p>Ask me to find pitches, matchups, or yesterday&apos;s games.</p>
                <div className="space-y-1.5">
                  {SAMPLES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="block w-full rounded border border-white/10 bg-white/5 px-3 py-1.5 text-left text-white/80 hover:bg-white/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`mb-2 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${
                    m.role === "user"
                      ? "bg-violet-500/20 text-white"
                      : "bg-white/5 text-white/90"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {pending && (
              <div className="text-xs text-white/40">Thinking…</div>
            )}
            {error && (
              <div className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {error}
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2 border-t border-white/10 p-3"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Show me Skenes's curveballs in 2025…"
              className="flex-1 rounded bg-white/5 px-3 py-2 text-sm placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-violet-400/50"
              disabled={pending}
            />
            {speechSupported && (
              <button
                type="button"
                onClick={toggleRecording}
                className={`flex h-9 w-9 items-center justify-center rounded ${
                  recording
                    ? "bg-red-500/20 text-red-300"
                    : "bg-white/5 text-white/70 hover:bg-white/10"
                }`}
                aria-label={recording ? "Stop recording" : "Start voice input"}
              >
                <MicIcon />
              </button>
            )}
            <button
              type="submit"
              disabled={pending || input.trim().length === 0}
              className="rounded bg-gradient-to-br from-fuchsia-500 to-violet-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}

const SAMPLES = [
  "Show me Paul Skenes's curveballs in 2025",
  "Pitchers vs Juan Soto yesterday",
  "Compare Skubal and Skenes",
  "Show me Sandy Alcantara's tunneling",
];

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
      <path d="M12 2l1.7 4.6L18 8.2l-4.3 1.7L12 14.5l-1.7-4.6L6 8.2l4.3-1.6L12 2zm6 10l1 2.8L21.8 16 19 17l-1 2.8L17 17l-2.8-1L17 14.8 18 12zM5 13l.8 2.3L8 16l-2.2.7L5 19l-.8-2.3L2 16l2.2-.7L5 13z" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 1 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z" />
    </svg>
  );
}
