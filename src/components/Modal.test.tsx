import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/Modal";

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Modal label="Test dialog" onClose={onClose} size="sm" {...props}>
      <button>Inside</button>
    </Modal>
  );
  return { onClose, ...utils };
}

describe("Modal", () => {
  it("exposes dialog semantics with an accessible name", () => {
    // None of the four hand-rolled overlays this replaces had a role at all,
    // so a screen reader announced them as anonymous divs (issue #23).
    renderModal();
    expect(screen.getByRole("dialog", { name: "Test dialog" })).toBeTruthy();
  });

  it("opens modally, which is what traps focus and restores it on close", () => {
    const { container } = renderModal();
    const dialog = container.querySelector("dialog");
    expect(dialog?.open).toBe(true);
  });

  it("closes on Escape without letting the app's global handler also fire", () => {
    const { onClose, container } = renderModal();
    const dialog = container.querySelector("dialog");

    fireEvent(dialog!, new Event("cancel", { bubbles: false, cancelable: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on a backdrop click but not on a click inside", () => {
    const { onClose, container } = renderModal();
    const dialog = container.querySelector("dialog");

    fireEvent.click(screen.getByRole("button", { name: "Inside" }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(dialog!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores backdrop clicks when asked to, for dialogs holding form state", () => {
    // Settings carry uncommitted input; a stray click on the backdrop must not
    // discard what the visitor has typed.
    const { onClose, container } = renderModal({ dismissOnBackdrop: false });

    fireEvent.click(container.querySelector("dialog")!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("sets no inline styles that could override the stylesheet", () => {
    // A modal <dialog> is centred by `margin: auto` alongside the UA
    // stylesheet's `inset: 0`; overriding the margin with `0` pins it to the
    // top-left corner. That rule now lives in Modal.css, so what is worth
    // asserting here is the thing this file *can* see: that the component
    // reintroduces no inline style at all, since an inline margin would win
    // over the stylesheet. Whether the dialog actually lands centred is a
    // visual check — happy-dom applies neither the external stylesheet nor the
    // UA cascade, so asserting it here would prove nothing.
    const { container } = renderModal();
    expect(container.querySelector("dialog")?.getAttribute("style")).toBeNull();
  });

  it("carries the size as a class so the width lives in the stylesheet", () => {
    const { container } = renderModal({ size: "xl" });
    expect(container.querySelector("dialog")?.className).toContain("modal-dialog--xl");
  });
});
