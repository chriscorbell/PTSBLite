import { useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import type { OptimizationMode } from "@/domain/pathfinder";
import "@/components/AutoBuildModal.css";

const OPTIMIZATION_OPTIONS: Array<{ value: OptimizationMode; label: string; detail: string }> = [
  { value: "shortest", label: "Shortest path", detail: "Minimizes total centerline length." },
  { value: "fewest-bends", label: "Fewest bends", detail: "Penalizes direction changes." }
];

export type AutoBuildModalProps = {
  onRun: (mode: OptimizationMode) => void;
  /** How many parts in the design Auto-Build placed; 0 disables clearing. */
  clearablePartCount: number;
  /** Remove every part Auto-Build placed. Undoable, like any other edit. */
  onClear: () => void;
  onClose: () => void;
};

/**
 * Asks which way to route before Auto-Build runs.
 *
 * Nothing is selected when it opens, and Run stays disabled until something is:
 * the two modes produce materially different systems, so this is a choice to
 * make rather than a default to accept. It replaces a split button whose mode
 * dropdown carried a remembered setting most visitors never opened.
 */
export function AutoBuildModal({
  onRun,
  clearablePartCount,
  onClear,
  onClose
}: AutoBuildModalProps) {
  const [mode, setMode] = useState<OptimizationMode | null>(null);

  return (
    <Modal label="Auto-Build" onClose={onClose} dismissOnBackdrop={false} size="sm">
      <>
        <div className="modal__header">
          <Icons.Auto size={16} />
          <div className="modal__title">Auto-Build</div>
        </div>
        <div className="auto-build-modal__body">
          <p className="auto-build-modal__note">Choose how to route between the open ports.</p>
          <div className="auto-build-modal__options">
            {OPTIMIZATION_OPTIONS.map((option) => (
              <label key={option.value} className="auto-build-modal__option">
                <input
                  type="radio"
                  name="auto-build-mode"
                  checked={mode === option.value}
                  onChange={() => setMode(option.value)}
                />
                <span>
                  <span className="auto-build-modal__option-label">{option.label}</span>
                  <span className="auto-build-modal__option-detail">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="modal__actions">
          <button
            className="topbtn"
            disabled={clearablePartCount === 0}
            title={
              clearablePartCount === 0
                ? "No Auto-Build parts to remove"
                : "Remove every part Auto-Build placed. This can be undone."
            }
            onClick={onClear}
          >
            Clear Auto-Build
          </button>
          <div className="modal__spacer" />
          <button className="topbtn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="topbtn primary"
            disabled={mode === null}
            onClick={() => mode && onRun(mode)}
          >
            <Icons.Auto size={12} /> Run Auto-Build
          </button>
        </div>
      </>
    </Modal>
  );
}
