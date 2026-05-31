import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Icons } from "@/components/Icons";
import type { AppSettings } from "@/domain/app-settings";
import { partRegistry } from "@/domain/part-registry";
import type { DesignMetadata } from "@/types";

export type SettingsTab = "pricing" | "quote" | "system";

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

  const handleSave = () => {
    onSettingsChange(draft);
    if (meta.filename !== metadata.filename || meta.revision !== metadata.revision) {
      onMetadataChange(meta);
    }
    onClose();
  };

  return (
    <div
      className="nosel"
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(5,7,10,0.75)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(620px, 92%)",
          maxHeight: "88%",
          display: "flex",
          flexDirection: "column",
          background: "var(--panel)",
          borderRadius: 10,
          border: "1px solid var(--line-2)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)"
        }}
      >
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
                  activeTab === t.id ? "color-mix(in oklab, var(--accent) 14%, transparent)" : "transparent",
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
                      value={draft.pricing[key] ?? entry.unitPrice}
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
                  value={+(draft.taxRate * 100).toFixed(4)}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, taxRate: Math.max(0, Number(e.target.value) / 100) }))
                  }
                  style={{ ...inputStyle, width: 140 }}
                />
              </Field>
              <Field label="Bill-to name">
                <input
                  value={draft.quote.billTo.name}
                  onChange={(e) => setQuote({ billTo: { ...draft.quote.billTo, name: e.target.value } })}
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
                  onChange={(e) => setQuote({ project: { ...draft.quote.project, name: e.target.value } })}
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
                  style={{ ...inputStyle, height: "auto", padding: 8, resize: "vertical" }}
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
      </div>
    </div>
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
