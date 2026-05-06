"use client";

import { useState } from "react";

export function CompareLinkActions() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="px-2.5 py-1 rounded text-[11px] uppercase tracking-[0.14em] bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-white/85 transition-colors"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
