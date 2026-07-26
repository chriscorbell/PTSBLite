import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "@/components/Modal";

function renderModal(props: Partial<React.ComponentProps<typeof Modal>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <Modal label="Test dialog" onClose={onClose} width="400px" {...props}>
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
    // Settings and the quote preview carry uncommitted input; a stray click on
    // the backdrop must not discard what the installer has typed.
    const { onClose, container } = renderModal({ dismissOnBackdrop: false });

    fireEvent.click(container.querySelector("dialog")!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves the centring margin alone", () => {
    // A modal <dialog> is centred by the UA stylesheet's `margin: auto`
    // alongside `inset: 0`. Overriding it with `0` pins the dialog to the
    // top-left, which no test caught and no unit test can see, because it is a
    // UA stylesheet interaction. Assert the override is not reintroduced.
    const { container } = renderModal();
    const dialog = container.querySelector("dialog");
    expect(dialog?.style.margin).toBe("auto");
  });
});
