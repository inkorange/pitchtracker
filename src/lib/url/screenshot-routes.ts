// Paths that exist purely as screenshot targets for the X.com weekly
// scheduler skill. They render a clean leaderboard with no chrome,
// captured by Playwright at a fixed viewport size and posted.
//
// SiteFooter and AiChat skip rendering on these paths so the screenshot
// is just the content. Add new entries here as we ship more weekly
// leaderboards (velocity_leaders, whiff_leaders, etc.).
const SCREENSHOT_PATHS = new Set<string>([
  "/strikeout_leaders",
]);

export function isScreenshotRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return SCREENSHOT_PATHS.has(pathname);
}
