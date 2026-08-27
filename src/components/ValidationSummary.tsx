import { Icons } from "@/components/Icons";
import type { Warning } from "@/types";
import "@/components/ValidationSummary.css";

/**
 * What validation currently says about the design.
 *
 * Shared because the status bar and the Finalize dialog both show it, and the
 * client asked for the second one explicitly ("the splash screen should have a
 * copy/version of the config validation box at the top"). Two renderings of
 * the same list would eventually disagree about how bad something is.
 */
export function ValidationSummary({ warnings }: { warnings: Warning[] }) {
  return (
    <div className="validation">
      <div className="validation__heading">VALIDATION</div>
      {warnings.length === 0 ? (
        <div className="validation__pass">
          <div className="validation__badge validation__badge--ok">
            <Icons.Check size={11} />
          </div>
          <div className="validation__text">
            <div className="validation__title">All checks pass</div>
          </div>
        </div>
      ) : (
        <div className="validation__list">
          {warnings.map((w) => (
            <div
              key={w.id}
              className={`validation__item${w.level === "error" ? " validation__item--error" : ""}`}
            >
              <div className="validation__badge">
                <Icons.Warn size={11} />
              </div>
              <div className="validation__text">
                <div className="validation__title">{w.title}</div>
                <div className="validation__detail">{w.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
