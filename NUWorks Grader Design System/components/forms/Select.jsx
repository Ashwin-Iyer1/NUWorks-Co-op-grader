export function Select({ label, options = [], style, selectStyle, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", ...style }}>
      {label && <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>{label}</label>}
      <select
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{
          width: "100%", boxSizing: "border-box", padding: "9px 10px",
          background: "var(--input-bg)",
          border: `1px solid ${focus ? "var(--accent)" : "var(--border-hover)"}`,
          boxShadow: focus ? "0 0 0 3px var(--accent-glow)" : "var(--shadow-sm)",
          borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: "0.9rem",
          fontFamily: "var(--font-sans)", outline: "none", transition: "border-color var(--transition), box-shadow var(--transition)",
          ...selectStyle,
        }}
        {...rest}
      >
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return <option key={opt.value} value={opt.value} style={{ background: "var(--bg-card)", color: "var(--text)" }}>{opt.label}</option>;
        })}
      </select>
    </div>
  );
}
