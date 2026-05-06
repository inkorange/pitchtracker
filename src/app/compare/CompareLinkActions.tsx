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
      className="text-[10px] uppercase tracking-[0.14em] text-white/70 hover:text-white transition-colors"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
