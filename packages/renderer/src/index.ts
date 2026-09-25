import type { Renderer } from "@reflowpress/core";

/** Type-level contract reserved for the future Vivliostyle integration. */
export interface VivliostyleRenderer extends Renderer {
  readonly id: "vivliostyle";
}
