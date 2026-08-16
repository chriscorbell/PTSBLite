import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import "@/components/AboutModal.css";

export type AboutModalProps = {
  productName: string;
  openExternal: (url: string) => void;
  onClose: () => void;
};

// Injected at build time from package.json and the current commit.
const GITHUB_URL = __GITHUB_URL__;
const VERSION = __APP_VERSION__;
const DESCRIPTION = __APP_DESCRIPTION__;

export function AboutModal({ productName, openExternal, onClose }: AboutModalProps) {
  return (
    <Modal label={`About ${productName}`} onClose={onClose} size="sm">
      <>
        <div className="modal__header">
          <Icons.Info size={15} />
          <div className="modal__title">About</div>
          <div className="modal__spacer" />
          <button onClick={onClose} className="icon-btn" aria-label="Close about">
            <Icons.Close size={14} />
          </button>
        </div>

        <div className="about__body">
          <div>
            <div className="about__name">{productName}</div>
            <div className="about__description">{DESCRIPTION}</div>
          </div>

          <div className="about__version">
            <span>Version</span>
            <span className="about__version-number">{VERSION}</span>
          </div>

          <div className="about__links">
            <button className="topbtn" onClick={() => openExternal(GITHUB_URL)}>
              <Icons.Github size={14} /> View on GitHub
            </button>
          </div>
        </div>
      </>
    </Modal>
  );
}
