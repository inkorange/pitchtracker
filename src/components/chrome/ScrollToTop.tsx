"use client";

import { useLayoutEffect } from "react";

/**
 * Scrolls the window to the top when mounted.
 *
 * Render it inside a route's loading.tsx. Next.js normally scrolls a
 * newly navigated page into view, but when the destination shows a
 * loading.tsx fallback first, its scroll handling finds no element to
 * measure and skips the scroll — so /browse → /browse/[teamId] used to
 * land mid-page at the previous scroll offset. The fallback only shows
 * on a fresh navigation (back/forward restores from the router cache),
 * so this doesn't fight scroll restoration.
 */
export function ScrollToTop() {
  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return null;
}
