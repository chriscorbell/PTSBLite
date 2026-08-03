import { useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { SystemDetailsFields } from "@/components/SystemDetailsFields";
import { clampBuildArea } from "@/domain/sparse-grid";
import type { DesignMetadata } from "@/types";

export type DesignSettingsModalProps = {
  metadata: DesignMetadata;
  onMetadataChange: (next: DesignMetadata) => void;
  onClose: () => void;
};

/**
 * PTSBuilderLite's whole Settings screen.
 *
 * One pane and no tab bar, because the other three — Parts Pricing, Quote & Tax,
 * Company — exist only to produce a quote, and this product has none. They are
 * not hidden here; they are in a module this product never imports.
 */
export function DesignSettingsModal({
  metadata,
  onMetadataChange,
  onClose
}: DesignSettingsModalProps) {
  // Edit against a draft and commit on Save, matching how the desktop settings
  // screen behaves — a half-typed build-area number should not resize the grid.
  const [draft, setDraft] = useState<DesignMetadata>(metadata);

  const handleSave = () => {
    onMetadataChange({ ...draft, buildArea: clampBuildArea(draft.buildArea) });
    onClose();
  };

  return (
    <Modal label="Design settings" onClose={onClose} size="md">
      <>
        <div className="modal__header">
          <Icons.Layers size={16} />
          <div className="modal__title">Design settings</div>
        </div>
        <div className="settings__panel">
          <SystemDetailsFields value={draft} onChange={setDraft} />
        </div>
        <div className="settings__footer">
          <button className="topbtn" onClick={onClose}>
            Cancel
          </button>
          <button className="topbtn active" onClick={handleSave}>
            <Icons.Check size={12} /> Save
          </button>
        </div>
      </>
    </Modal>
  );
}
