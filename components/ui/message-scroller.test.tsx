import { describe, expect, it } from "vitest"

import { MessageScrollerContent } from "./message-scroller"

// The primitive sizes `data-message-scroller-spacer` with `Math.ceil`,
// which overshoots fractional (subpixel) measurements by up to ~1px; the
// browsers' scrollHeight/clientHeight integer rounding then turns that into
// a ~2px phantom overflow — the scrollbar bug measured in Chrome. The
// wrapper's default `spacerClassName` negative margin cancels the artifact.
// Real overflow (messages that don't fit) dwarfs 2px, so it stays safe.
describe("MessageScrollerContent spacer sizing", () => {
  it("carries a default spacerClassName that cancels the ceil overfill", () => {
    const element = MessageScrollerContent({ children: null })

    expect(element.props.spacerClassName).toContain("mb-[-2px]")
  })

  it("lets a caller's spacerClassName win over the default", () => {
    // Regression guard: the change destructures the prop to merge the
    // default in — a caller must still be able to override it.
    const element = MessageScrollerContent({
      children: null,
      spacerClassName: "mb-8",
    })

    expect(element.props.spacerClassName).toBe("mb-8")
  })
})
