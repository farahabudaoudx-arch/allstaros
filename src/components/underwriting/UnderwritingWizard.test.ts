// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UnderwritingWizard, type WizardVitals } from "./UnderwritingWizard";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
let root: Root;
let container: HTMLDivElement;
let calls: Array<{ text: string; toolkit: string }>;
let reply: () => Promise<Response>;
const success = () => Promise.resolve(Response.json({
  ok: true, conditions: [], summary: "Test analysis", results: [], noConditionsMentioned: false,
}));

function Harness({ initial = "" }: { initial?: string }) {
  const [value, onChange] = useState(initial);
  const [vitals, onVitalsChange] = useState<WizardVitals>({ dob: "", height: "", weight: "" });
  return createElement(UnderwritingWizard, { value, onChange, vitals, onVitalsChange });
}
async function render(initial = "") {
  await act(async () => root.render(createElement(Harness, { initial })));
}
function button(name: string) {
  return Array.from(container.querySelectorAll("button")).find(b => b.textContent === name)!;
}
async function click(name: string) { await act(async () => button(name).click()); }
async function type(notes: string) {
  await act(async () => {
    const el = container.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, notes);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  calls = [];
  reply = success;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/underwriting/conditions")) {
      return Response.json({ ok: true, conditions: [{}], carriers: [] });
    }
    expect(url).toBe("/api/underwriting/analyze");
    calls.push(JSON.parse(init!.body as string));
    return reply();
  }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("does not analyze prefilled notes, typing pauses, blur, or toolkit changes", async () => {
  await render("prefilled notes");
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  await type("different notes");
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  await act(async () => container.querySelector("textarea")!.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  await click("IUL · Rated");
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(calls).toEqual([]);
  expect(button("Submit").disabled).toBe(false);
});

it("submits once with the selected toolkit and blocks duplicate submissions", async () => {
  await render();
  await type("has diabetes");
  await click("IUL · Rated");
  await click("Submit");
  expect(calls).toEqual([{ text: "has diabetes", toolkit: "IUL" }]);
  expect(button("Submit").disabled).toBe(true);
  await click("Submit");
  expect(calls).toHaveLength(1);
});

it("disables submission for blank notes and while a request is running", async () => {
  await render();
  expect(button("Submit").disabled).toBe(true);
  await type("   ");
  expect(button("Submit").disabled).toBe(true);
  await type("healthy");
  reply = () => new Promise(() => {});
  await act(async () => { button("Submit").click(); button("Submit").click(); });
  expect(calls).toHaveLength(1);
  expect(button("Analyzing…").disabled).toBe(true);
});

it("hides stale results when notes change and waits for another submit", async () => {
  await render("has diabetes");
  await click("Submit");
  expect(container.textContent).toContain("Analysis is up to date.");
  await type("has COPD");
  expect(container.textContent).not.toContain("Analysis is up to date.");
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(calls).toHaveLength(1);
  await click("Submit");
  expect(calls[1].text).toBe("has COPD");
});

it("allows an explicit retry after an error without retrying automatically", async () => {
  await render("healthy");
  reply = () => Promise.resolve(Response.json({ ok: false, error: "Please retry" }, { status: 502 }));
  await click("Submit");
  expect(container.textContent).toContain("Please retry");
  await act(async () => vi.advanceTimersByTimeAsync(5_000));
  expect(calls).toHaveLength(1);
  reply = success;
  await click("Submit");
  expect(calls).toHaveLength(2);
  expect(container.textContent).not.toContain("Please retry");
});

it("submits the latest dictated text before the polling timer fires", async () => {
  await render("old text");
  container.querySelector("textarea")!.value = "latest dictated notes";
  await click("Submit");
  expect(calls[0].text).toBe("latest dictated notes");
});

it("vital edits make no paid requests and are included on submit", async () => {
  await render("healthy");
  await act(async () => {
    const el = container.querySelector<HTMLInputElement>('input[placeholder="180 lbs"]')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, "190");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(calls).toHaveLength(0);
  await click("Submit");
  expect(calls[0].text).toContain("Weight: 190");
});

it("ignores an old response after a toolkit switch and does not auto-submit", async () => {
  await render("healthy");
  let finish!: (response: Response) => void;
  reply = () => new Promise(resolve => { finish = resolve; });
  await click("Submit");
  await click("IUL · Rated");
  await act(async () => finish(await success()));
  expect(calls).toHaveLength(1);
  expect(container.textContent).not.toContain("Analysis is up to date.");
  expect(button("Submit").disabled).toBe(false);
});
