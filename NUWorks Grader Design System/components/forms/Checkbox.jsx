export function Checkbox({ label, checked, onChange, style, ...rest }) {
  const id = React.useId();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px", ...style }}>
      <input type="checkbox" id={id} checked={checked} onChange={onChange}
        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "var(--accent)", margin: 0 }} {...rest} />
      <label htmlFor={id} style={{ cursor: "pointer", fontSize: "0.88rem", color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>{label}</label>
    </div>
  );
}
