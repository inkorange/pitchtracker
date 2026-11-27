"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

/** ?color=outcome colors the scene by pitch result; default is by type. */
export const COLOR_BY_PARSER = parseAsStringLiteral(["type", "outcome"] as const).withDefault("type");
export function useColorBy() {
  return useQueryState("color", COLOR_BY_PARSER);
}
