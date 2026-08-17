import { useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { NameFields } from "@/components/NameFields";
import { DEFAULT_SYSTEM_NAME } from "@/domain/design-state";
import "@/components/SystemDetailsModal.css";

export type SystemDetailsModalProps = {
  companyName: string;
  systemName: string;
  onSave: (names: { companyName: string; systemName: string }) => void;
  onClose: () => void;
};

/**
 * Renames a design, reached by clicking its label in the top bar.
 *
 * Names are the one thing about an existing design that is safe to change:
 * unlike the build area, nothing is placed relative to them. Editing is local
 * until Save, so backdrop dismissal stays off and Cancel genuinely discards.
 */
export function SystemDetailsModal({
  companyName,
  systemName,
  onSave,
  onClose
}: SystemDetailsModalProps) {
  const [company, setCompany] = useState(companyName);
  const [system, setSystem] = useState(systemName);

  const save = () =>
    onSave({
      companyName: company.trim(),
      systemName: system.trim() || DEFAULT_SYSTEM_NAME
    });

  return (
    <Modal label="System details" onClose={onClose} dismissOnBackdrop={false} size="md">
      <>
        <div className="modal__header">
          <Icons.Layers size={16} />
          <div className="modal__title">System details</div>
        </div>
        <div className="system-details__body">
          <NameFields
            companyName={company}
            systemName={system}
            onCompanyName={setCompany}
            onSystemName={setSystem}
            autoFocus
          />
          <p className="system-details__note">
            Shown in the top bar and on the exported PDF. The build area cannot be changed after a
            design is created.
          </p>
        </div>
        <div className="modal__actions">
          <button className="topbtn" onClick={onClose}>
            Cancel
          </button>
          <button className="topbtn primary" onClick={save}>
            <Icons.Check size={12} /> Save
          </button>
        </div>
      </>
    </Modal>
  );
}
