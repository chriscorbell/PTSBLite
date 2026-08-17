import "@/components/NameFields.css";

export type NameFieldsProps = {
  companyName: string;
  systemName: string;
  onCompanyName: (next: string) => void;
  onSystemName: (next: string) => void;
  /** Focus the company field on mount. Set where the fields are the point. */
  autoFocus?: boolean;
};

/**
 * Who the system is for, and what it is called.
 *
 * Shared by the setup form that collects them and the dialog that changes them
 * later, so the two cannot drift in wording or layout. Neither is required:
 * blank company reads as "not given", and a blank system name falls back to the
 * default at the call site.
 */
export function NameFields({
  companyName,
  systemName,
  onCompanyName,
  onSystemName,
  autoFocus = false
}: NameFieldsProps) {
  return (
    <div className="name-fields">
      <label className="name-fields__field">
        <span className="name-fields__label">Company name</span>
        <input
          value={companyName}
          onChange={(e) => onCompanyName(e.target.value)}
          placeholder="Optional"
          className="name-fields__input"
          autoFocus={autoFocus}
        />
      </label>
      <label className="name-fields__field">
        <span className="name-fields__label">System name</span>
        <input
          value={systemName}
          onChange={(e) => onSystemName(e.target.value)}
          placeholder="Untitled system"
          className="name-fields__input"
        />
      </label>
    </div>
  );
}
