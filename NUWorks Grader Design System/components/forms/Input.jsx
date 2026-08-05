export function Input({ label, hint, type = "text", style, inputStyle, ...rest }) {
  const [focus, setFocus] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", width: "100%", ...style }}>
      {label && <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>{label}</label>}
      <input
        type={type}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{
          width: "100%", boxSizing: "border-box", padding: "9px 12px",
          background: "var(--input-bg)",
          border: `1px solid ${focus ? "var(--accent)" : hover ? "var(--border-strong)" : "var(--border-hover)"}`,
          boxShadow: focus ? "0 0 0 3px var(--accent-glow)" : "var(--shadow-sm)",
          borderRadius: "var(--radius-sm)", color: "var(--text)", fontSize: "0.9rem",
          fontFamily: "var(--font-sans)", outline: "none", transition: "border-color var(--transition), box-shadow var(--transition)",
          ...inputStyle,
        }}
        {...rest}
      />
      {hint && <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, fontFamily: "var(--font-sans)" }}>{hint}</p>}
    </div>
  );
}
