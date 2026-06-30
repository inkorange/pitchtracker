"use client";

import { useState } from "react";
import { TOPNAV_BUTTON_CLS } from "@/components/chrome/TopNav";

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
      className={TOPNAV_BUTTON_CLS}
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
