import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Icons } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { SUGGESTED_QUOTE_NOTES, type AppSettings } from "@/domain/app-settings";
import { partRegistry } from "@/domain/part-registry";
import { BUILD_AREA_LIMITS, clampBuildArea } from "@/domain/sparse-grid";
import type { BuildArea, DesignMetadata } from "@/types";

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

// Build-area axes, labeled with their world-space axis for the System Details tab.
const BUILD_AREA_AXES: { key: keyof BuildArea; label: string }[] = [
  { key: "width", label: "Width (X)" },
  { key: "depth", label: "Depth (Z)" },
  { key: "height", label: "Height (Y)" }
];

const iconBtn: CSSProperties = {
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  color: "var(--text-mut)",
  background: "transparent",
  border: "1px solid transparent",
  cursor: "pointer"
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-mut)",
  marginBottom: 4,
  display: "block"
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 32,
  padding: "0 10px",
  borderRadius: 6,
  border: "1px solid var(--line-2)",
  background: "var(--panel-2)",
  color: "var(--text)",
  fontFamily: "var(--font-sans)",
  fontSize: 12,
  boxSizing: "border-box"
};

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

  const setBuildArea = (patch: Partial<BuildArea>) =>
    setMeta((m) => ({ ...m, buildArea: { ...m.buildArea, ...patch } }));

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
    <Modal
      label="Settings"
      onClose={onClose}
      width="min(620px, 92%)"
      dismissOnBackdrop={false}
      panelStyle={{ maxHeight: "88%" }}
    >
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 18px",
            borderBottom: "1px solid var(--line)"
          }}
        >
          <Icons.Hammer size={15} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>Settings</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={iconBtn} aria-label="Close settings">
            <Icons.Close size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: "10px 14px 0" }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 6,
                border: "1px solid " + (activeTab === t.id ? "var(--line-2)" : "transparent"),
                background:
                  activeTab === t.id
                    ? "color-mix(in oklab, var(--accent) 14%, transparent)"
                    : "transparent",
                color: activeTab === t.id ? "var(--accent)" : "var(--text-mut)",
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
          {activeTab === "pricing" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <p style={{ fontSize: 11, color: "var(--text-mut)", margin: "0 0 12px" }}>
                Unit prices are global and apply to every system. Part names and numbers are fixed.
              </p>
              {pricedParts.map(({ key, entry }) => (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 0",
                    borderBottom: "1px solid var(--line)"
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: "var(--text)" }}>{entry.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{entry.partNo}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: "var(--text-mut)", fontSize: 13 }}>$</span>
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
                      style={{ ...inputStyle, width: 120, textAlign: "right" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === "quote" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
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
                  style={{ ...inputStyle, width: 140 }}
                />
              </Field>
              <Field label="Bill-to name">
                <input
                  value={draft.quote.billTo.name}
                  onChange={(e) =>
                    setQuote({ billTo: { ...draft.quote.billTo, name: e.target.value } })
                  }
                  style={inputStyle}
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
                  style={{ ...inputStyle, height: "auto", padding: 8, resize: "vertical" }}
                />
              </Field>
              <Field label="Project name">
                <input
                  value={draft.quote.project.name}
                  onChange={(e) =>
                    setQuote({ project: { ...draft.quote.project, name: e.target.value } })
                  }
                  style={inputStyle}
                />
              </Field>
              <Field label="Quote number">
                <input
                  value={draft.quote.quoteNumber}
                  onChange={(e) => setQuote({ quoteNumber: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Notes / terms">
                <textarea
                  value={draft.quote.notes}
                  onChange={(e) => setQuote({ notes: e.target.value })}
                  rows={4}
                  placeholder="Printed at the foot of the quote."
                  style={{ ...inputStyle, height: "auto", padding: 8, resize: "vertical" }}
                />
                {draft.quote.notes.trim() === "" && (
                  <button
                    type="button"
                    className="topbtn"
                    style={{ marginTop: 6, alignSelf: "flex-start" }}
                    onClick={() => setQuote({ notes: SUGGESTED_QUOTE_NOTES })}
                  >
                    Use suggested wording
                  </button>
                )}
              </Field>
            </div>
          )}

          {activeTab === "company" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 11, color: "var(--text-mut)", margin: 0 }}>
                Your company appears in the letterhead of every exported quote. These are global and
                apply to every system.
              </p>
              <Field label="Company name">
                <input
                  value={draft.company.name}
                  onChange={(e) => setCompany({ name: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Tagline">
                <input
                  value={draft.company.tagline}
                  onChange={(e) => setCompany({ tagline: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Address">
                <input
                  value={draft.company.address}
                  onChange={(e) => setCompany({ address: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Phone">
                <input
                  value={draft.company.phone}
                  onChange={(e) => setCompany({ phone: e.target.value })}
                  style={inputStyle}
                />
              </Field>
              <Field label="Email">
                <input
                  value={draft.company.email}
                  onChange={(e) => setCompany({ email: e.target.value })}
                  style={inputStyle}
                />
              </Field>
            </div>
          )}

          {activeTab === "system" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <p style={{ fontSize: 11, color: "var(--text-mut)", margin: 0 }}>
                These belong to the current design and are saved with the file.
              </p>
              <Field label="System name">
                <input
                  value={meta.filename}
                  onChange={(e) => setMeta((m) => ({ ...m, filename: e.target.value }))}
                  style={inputStyle}
                />
              </Field>
              <Field label="Revision">
                <input
                  value={meta.revision}
                  onChange={(e) => setMeta((m) => ({ ...m, revision: e.target.value }))}
                  style={{ ...inputStyle, width: 140 }}
                />
              </Field>

              <div>
                <span style={labelStyle}>Build area (feet)</span>
                <div style={{ display: "flex", gap: 10 }}>
                  {BUILD_AREA_AXES.map(({ key, label }) => (
                    <label key={key} style={{ flex: 1 }}>
                      <span style={{ ...labelStyle, marginBottom: 4 }}>{label}</span>
                      <input
                        type="number"
                        min={BUILD_AREA_LIMITS[key].min}
                        max={BUILD_AREA_LIMITS[key].max}
                        step={1}
                        value={meta.buildArea[key]}
                        onChange={(e) => setBuildArea({ [key]: Number(e.target.value) })}
                        style={inputStyle}
                      />
                    </label>
                  ))}
                </div>
                <p style={{ fontSize: 11, color: "var(--text-mut)", margin: "8px 0 0" }}>
                  The buildable volume and the ground-plane grid (1 ft = 1 cell). The footprint is
                  centered on the origin; height rises from the floor.
                </p>
              </div>
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 18px",
            borderTop: "1px solid var(--line)"
          }}
        >
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  );
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
