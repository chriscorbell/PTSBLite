import { useMemo, useState } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { Field, SystemDetailsFields } from "@/components/SystemDetailsFields";
import { SUGGESTED_QUOTE_NOTES, type AppSettings } from "@/domain/app-settings";
import { partRegistry } from "@/domain/part-registry";
import { clampBuildArea } from "@/domain/sparse-grid";
import type { DesignMetadata } from "@/types";
import "@/components/commercial/SettingsModal.css";

export type SettingsTab = "pricing" | "quote" | "company" | "system";

export type SettingsModalProps = {
  tab: SettingsTab;
  settings: AppSettings;
  onSettingsChange: (next: AppSettings) => void;
  metadata: DesignMetadata;
  onMetadataChange: (next: DesignMetadata) => void;
  onClose: () => void;
};

// The priced catalog parts the user may re-price (obstacle is $0 / "—", excluded).
const PRICED_KEYS = ["blower", "terminal", "tube6", "bend90"] as const;

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "pricing", label: "Parts Pricing" },
  { id: "quote", label: "Quote & Tax" },
  { id: "company", label: "Company" },
  { id: "system", label: "System Details" }
];

export function SettingsModal({
  tab,
  settings,
  onSettingsChange,
  metadata,
  onMetadataChange,
  onClose
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(tab);
  // Edit against drafts; commit everything on Save so we persist once, not per keystroke.
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [meta, setMeta] = useState<DesignMetadata>(metadata);

  const pricedParts = useMemo(
    () => PRICED_KEYS.map((key) => ({ key, entry: partRegistry.get(key) })),
    []
  );

  const setPrice = (key: string, value: number | undefined) => {
    setDraft((d) => {
      const pricing = { ...d.pricing };
      if (value === undefined) delete pricing[key];
      else pricing[key] = value;
      return { ...d, pricing };
    });
  };

  const setQuote = (patch: Partial<AppSettings["quote"]>) =>
    setDraft((d) => ({ ...d, quote: { ...d.quote, ...patch } }));

  const setCompany = (patch: Partial<AppSettings["company"]>) =>
    setDraft((d) => ({ ...d, company: { ...d.company, ...patch } }));

  const handleSave = () => {
    onSettingsChange(draft);
    // Clamp the build area to whole feet within limits before committing.
    const nextMeta: DesignMetadata = { ...meta, buildArea: clampBuildArea(meta.buildArea) };
    const metaChanged =
      nextMeta.filename !== metadata.filename ||
      nextMeta.revision !== metadata.revision ||
      nextMeta.buildArea.width !== metadata.buildArea.width ||
      nextMeta.buildArea.depth !== metadata.buildArea.depth ||
      nextMeta.buildArea.height !== metadata.buildArea.height;
    if (metaChanged) onMetadataChange(nextMeta);
    onClose();
  };

  return (
    <Modal label="Settings" onClose={onClose} size="lg" dismissOnBackdrop={false}>
      <>
        <div className="modal__header">
          <Icons.Hammer size={15} />
          <div className="modal__title">Settings</div>
          <div className="modal__spacer" />
          <button onClick={onClose} className="icon-btn" aria-label="Close settings">
            <Icons.Close size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="settings__tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className="settings__tab"
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings__panel">
          {activeTab === "pricing" && (
            <div className="settings__price-list">
              <p className="settings__note settings__note--pricing">
                Unit prices are global and apply to every system. Part names and numbers are fixed.
              </p>
              {pricedParts.map(({ key, entry }) => (
                <div key={key} className="settings__price-row">
                  <div className="settings__price-part">
                    <div className="settings__price-name">{entry.name}</div>
                    <div className="settings__price-no">{entry.partNo}</div>
                  </div>
                  <div className="settings__price-input">
                    <span className="settings__currency">$</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draft.pricing[key] ?? ""}
                      placeholder="Not set"
                      onChange={(e) => {
                        const v = e.target.value;
                        setPrice(key, v === "" ? undefined : Math.max(0, Number(v)));
                      }}
                      className="settings__input settings__input--price"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "quote" && (
            <div className="settings__fields">
              <Field label="Sales tax rate (%)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.taxRate === null ? "" : +(draft.taxRate * 100).toFixed(4)}
                  placeholder="Not set"
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => ({
                      ...d,
                      taxRate: v === "" ? null : Math.max(0, Number(v) / 100)
                    }));
                  }}
                  className="settings__input settings__input--narrow"
                />
              </Field>
              <Field label="Bill-to name">
                <input
                  value={draft.quote.billTo.name}
                  onChange={(e) =>
                    setQuote({ billTo: { ...draft.quote.billTo, name: e.target.value } })
                  }
                  className="settings__input"
                />
              </Field>
              <Field label="Bill-to address (one line each)">
                <textarea
                  value={draft.quote.billTo.lines.join("\n")}
                  onChange={(e) =>
                    setQuote({
                      billTo: { ...draft.quote.billTo, lines: splitLines(e.target.value) }
                    })
                  }
                  rows={2}
                  className="settings__input"
                />
              </Field>
              <Field label="Project name">
                <input
                  value={draft.quote.project.name}
                  onChange={(e) =>
                    setQuote({ project: { ...draft.quote.project, name: e.target.value } })
                  }
                  className="settings__input"
                />
              </Field>
              <Field label="Quote number">
                <input
                  value={draft.quote.quoteNumber}
                  onChange={(e) => setQuote({ quoteNumber: e.target.value })}
                  className="settings__input"
                />
              </Field>
              <Field label="Notes / terms">
                <textarea
                  value={draft.quote.notes}
                  onChange={(e) => setQuote({ notes: e.target.value })}
                  rows={4}
                  placeholder="Printed at the foot of the quote."
                  className="settings__input"
                />
                {draft.quote.notes.trim() === "" && (
                  <button
                    type="button"
                    className="topbtn settings__field-action"
                    onClick={() => setQuote({ notes: SUGGESTED_QUOTE_NOTES })}
                  >
                    Use suggested wording
                  </button>
                )}
              </Field>
            </div>
          )}

          {activeTab === "company" && (
            <div className="settings__fields">
              <p className="settings__note">
                Your company appears in the letterhead of every exported quote. These are global and
                apply to every system.
              </p>
              <Field label="Company name">
                <input
                  value={draft.company.name}
                  onChange={(e) => setCompany({ name: e.target.value })}
                  className="settings__input"
                />
              </Field>
              <Field label="Tagline">
                <input
                  value={draft.company.tagline}
                  onChange={(e) => setCompany({ tagline: e.target.value })}
                  className="settings__input"
                />
              </Field>
              <Field label="Address">
                <input
                  value={draft.company.address}
                  onChange={(e) => setCompany({ address: e.target.value })}
                  className="settings__input"
                />
              </Field>
              <Field label="Phone">
                <input
                  value={draft.company.phone}
                  onChange={(e) => setCompany({ phone: e.target.value })}
                  className="settings__input"
                />
              </Field>
              <Field label="Email">
                <input
                  value={draft.company.email}
                  onChange={(e) => setCompany({ email: e.target.value })}
                  className="settings__input"
                />
              </Field>
            </div>
          )}

          {activeTab === "system" && <SystemDetailsFields value={meta} onChange={setMeta} />}
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

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
