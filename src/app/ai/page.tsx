import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/chrome/TopNav";
import { absoluteUrl } from "@/lib/url/site";

// Public landing page for the AI chat tool. The chat itself lives
// in the floating icon (rendered by the root layout) and isn't
// crawlable — Google can't see what's behind a click + JavaScript-
// driven response stream. This page is the crawlable surface that
// describes the capability, names example queries, and ships the
// SoftwareApplication + FAQPage structured data Google needs to
// surface us in AI-powered SERPs and rich results.

const SAMPLE_QUERIES: Array<{ q: string; what: string }> = [
  {
    q: "Show me Paul Skenes's curveballs in 2025",
    what: "Filters his pitcher page to a single pitch type for a season.",
  },
  {
    q: "What's Dylan Cease's average fastball speed?",
    what: "Looks up aggregate stats and answers in chat — no navigation.",
  },
  {
    q: "Show me all the strikeouts from Sandy Alcantara's last game",
    what: "Finds his most recent appearance, jumps straight to the first K replay with the sidebar filtered to all his Ks that game.",
  },
  {
    q: "Show me pitches over 95 mph",
    what: "Adds a velocity filter to whatever pitcher page you're on.",
  },
  {
    q: "Compare Skubal and Skenes",
    what: "Loads the /compare view with both arsenals overlaid.",
  },
  {
    q: "Show me Sandy Alcantara's tunneling",
    what: "Turns on the pitch-tunneling envelope on his pitcher page.",
  },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What can the PitchTracker AI assistant do?",
    a: "It translates natural-language questions about MLB pitchers, batters, and at-bats into the right page on PitchTracker. Ask for a pitcher's arsenal, a specific game's strikeouts, a matchup between two players, a velocity range, or aggregate stats. It either navigates you to the answer or replies with the number in chat for stat questions.",
  },
  {
    q: "How do I open the AI chat?",
    a: "Tap the colorful sparkle icon in the bottom-left corner of any page. The chat panel opens with sample queries to get you started. You can type or use the mic icon for voice input.",
  },
  {
    q: "Does the AI cost anything to use?",
    a: "No, it's free. Each anonymous IP is rate-limited to 10 requests per minute and 100 per day to keep usage costs bounded.",
  },
  {
    q: "What MLB seasons does the AI know about?",
    a: "Current and previous season are cached for fast lookups. Older seasons are fetched on-demand from Baseball Savant when you navigate to them.",
  },
  {
    q: "Can the AI answer questions about specific at-bats?",
    a: "Yes. Ask for 'the strikeouts in this game' / 'every home run in this game' / 'walks Skenes gave up in his last start' and it navigates to the first matching at-bat's 3D replay with the sidebar pre-filtered to siblings.",
  },
  {
    q: "Does voice input work on mobile?",
    a: "Yes, on Android Chrome and iOS Safari (Firefox doesn't support the underlying Web Speech API). Tap the mic, say your query, the engine auto-stops when you pause and submits.",
  },
  {
    q: "What if I misspell a player's name?",
    a: "The name resolver uses phonetic matching (Postgres dmetaphone). Speech-to-text errors like 'McClain' for 'McLean' or typos like 'Skeenz' for 'Skenes' resolve to the right player automatically.",
  },
];

export const metadata: Metadata = {
  title: "Ask PitchTracker · Natural-language MLB pitch analysis",
  description:
    "Ask PitchTracker's AI any question about MLB pitchers, batters, at-bats, or specific games. Voice or text. Translates natural language into 3D pitch visualizations.",
  alternates: { canonical: "/ai" },
  // Interactive chat page — no static content for Google to rank, and
  // the URL itself doesn't map to a query anyone naturally searches
  // for. Noindex tells Google to stop spending crawl budget here and
  // routes authority to the pitcher / at-bat pages that actually
  // answer search queries. `follow` stays on so the sidebar links to
  // pitcher pages still transfer PageRank.
  robots: { index: false, follow: true },
  openGraph: {
    title: "Ask PitchTracker · AI-powered MLB pitch analysis",
    description:
      "Voice or text. Ask for a pitcher's arsenal, a game's strikeouts, a head-to-head matchup, or an aggregate stat — the AI navigates you there.",
    url: "/ai",
    images: [{ url: "/logo.png", width: 256, height: 256, alt: "PitchTracker" }],
  },
  twitter: {
    card: "summary",
    title: "Ask PitchTracker · AI-powered MLB pitch analysis",
    description:
      "Voice or text. Ask for a pitcher's arsenal, a game's strikeouts, a head-to-head matchup, or an aggregate stat.",
    images: ["/logo.png"],
  },
};

export default function AiLandingPage() {
  // Two JSON-LD blocks: SoftwareApplication describes the tool
  // itself; FAQPage marks up the FAQ list so Google can pull
  // questions into rich SERP results and AI Overviews.
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Ask PitchTracker",
    applicationCategory: "SportsApplication",
    operatingSystem: "Web browser",
    description:
      "Natural-language assistant for the PitchTracker MLB pitch-visualization tool. Translates voice or text queries into 3D pitch arsenal views, at-bat replays, matchup analyses, and aggregate stat answers.",
    url: absoluteUrl("/ai"),
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    featureList: [
      "Natural-language navigation to any pitcher's arsenal",
      "Voice input (Web Speech API)",
      "Aggregate stat lookups (avg velocity, whiff rate, etc.)",
      "Game and at-bat result filtering",
      "Phonetic name matching for speech-to-text errors",
      "Multi-turn conversation with page-context awareness",
    ],
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="min-h-screen bg-[#0a0e14] text-white/90 pt-20 pb-16 px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <TopNav title="AI assistant" />

      <article className="max-w-3xl mx-auto space-y-12">
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-fuchsia-500/20 to-cyan-400/20 border border-white/15 text-[10px] uppercase tracking-[0.18em] text-white/85">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-400" />
            AI assistant
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            Ask PitchTracker
          </h1>
          <p className="text-lg text-white/75 leading-relaxed">
            Ask any question about MLB pitchers, batters, at-bats, or specific
            games. The AI translates your natural-language query — typed or
            spoken — into the right 3D pitch view on PitchTracker.
          </p>
          <p className="text-sm text-white/55 leading-relaxed">
            Open the floating sparkle icon in the bottom-left corner of any
            page to start a conversation. Voice input works on Android Chrome
            and iOS Safari.
          </p>
        </header>

        <section className="space-y-4">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
            Sample queries
          </h2>
          <ul className="space-y-2">
            {SAMPLE_QUERIES.map((s) => (
              <li
                key={s.q}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3"
              >
                <div className="text-white/95 font-medium">“{s.q}”</div>
                <div className="text-[12px] text-white/55 mt-1 leading-relaxed">
                  {s.what}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-[10px] uppercase tracking-[0.18em] text-white/55">
            FAQ
          </h2>
          <ul className="space-y-3">
            {FAQS.map((f) => (
              <li
                key={f.q}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3"
              >
                <div className="text-white/95 font-medium">{f.q}</div>
                <div className="text-[13px] text-white/70 mt-2 leading-relaxed">
                  {f.a}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5 space-y-3">
          <h2 className="text-base font-medium text-white/95">
            What it&apos;s built on
          </h2>
          <p className="text-[13px] text-white/65 leading-relaxed">
            The chat uses Anthropic&apos;s Claude (Haiku 4.5) through the Vercel
            AI Gateway, paired with custom tools that query our cached MLB
            pitch dataset. Pitch trajectories come from Baseball Savant&apos;s
            Statcast measurements. Names and aggregate stats are resolved
            against our Supabase Postgres cache with phonetic fallback so
            misspellings don&apos;t dead-end.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-md bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-sm transition-colors"
            >
              Open PitchTracker
            </Link>
            <Link
              href="/browse"
              className="px-3 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-sm transition-colors"
            >
              Browse pitchers
            </Link>
            <Link
              href="/explore"
              className="px-3 py-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] border border-white/10 text-sm transition-colors"
            >
              Explore the dataset
            </Link>
          </div>
        </section>
      </article>
    </main>
  );
}
