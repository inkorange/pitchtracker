// Open the floating Ask PitchTracker chat from anywhere on the page.
// AiChat (mounted once in the root layout) listens for this event.

export const AI_OPEN_EVENT = "pitchtracker:ai-open";

export interface AiOpenDetail {
  /** Question to put in the input box. */
  q?: string;
  /** Send `q` immediately instead of just pre-filling it. */
  autoSend?: boolean;
}

export function openAiChat(detail: AiOpenDetail = {}): void {
  window.dispatchEvent(new CustomEvent<AiOpenDetail>(AI_OPEN_EVENT, { detail }));
}
