import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LowerThird, ScoreBug, Ticker, TICKER_REPEAT } from "..";

const items = [
  { k: "VELO", name: "M. Miller", v: "101.4" },
  { k: "K", name: "J. Misiorowski", v: "252" },
  { k: "VAA", name: "P. Sewald", v: "-3.10°" },
];

describe("Ticker", () => {
  it("renders the list TICKER_REPEAT times for the seamless loop", () => {
    render(<Ticker items={items} label="2026 Leaders" />);
    const region = screen.getByRole("region", { name: "2026 Leaders" });
    // getAllByRole skips aria-hidden nodes, so query the DOM directly.
    expect(region.querySelectorAll("li")).toHaveLength(items.length * TICKER_REPEAT);
  });

  it("exposes only the first copy to assistive tech", () => {
    render(<Ticker items={items} label="2026 Leaders" />);
    const list = screen.getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(items.length);
  });

  it("keeps the repeat count even so the -50% translate loops cleanly", () => {
    expect(TICKER_REPEAT % 2).toBe(0);
  });

  it("renders nothing with no items", () => {
    const { container } = render(<Ticker items={[]} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("ScoreBug", () => {
  it("renders segments in order with an accessible label", () => {
    render(
      <ScoreBug
        label="Milwaukee, Jacob Misiorowski, right-handed pitcher"
        segments={[
          { tone: "team", content: "MIL" },
          { tone: "name", content: "J. Misiorowski" },
          { tone: "tag", content: "RHP" },
        ]}
      />,
    );
    const bug = screen.getByRole("group", { name: /Misiorowski/ });
    expect(bug.textContent).toBe("MILJ. MisiorowskiRHP");
  });
});

describe("LowerThird", () => {
  it("uses the given color for the left rule", () => {
    const { container } = render(
      <LowerThird label="Pitch 3 of 6" value="Slider · 88.4 mph" color="#b392f0" />,
    );
    expect((container.firstChild as HTMLElement).style.borderLeftColor).toBe(
      "rgb(179, 146, 240)",
    );
  });
});
