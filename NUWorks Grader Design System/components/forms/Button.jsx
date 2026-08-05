export function Button({ variant = "primary", size = "md", disabled = false, children, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const base = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px",
    borderRadius: "var(--radius-sm)", fontWeight: 600, fontFamily: "var(--font-sans)",
    cursor: disabled ? "not-allowed" : "pointer", transition: "all var(--transition)",
    whiteSpace: "nowrap", border: "1px solid transparent", opacity: disabled ? 0.45 : 1,
    textDecoration: "none", transform: active && !disabled ? "scale(0.98)" : "none",
  };
  const sizes = {
    sm: { padding: "7px 16px", fontSize: "0.85rem" },
    md: { padding: "10px 22px", fontSize: "0.9rem" },
    lg: { padding: "12px 28px", fontSize: "0.95rem" },
  };
  const variants = {
    primary: {
      background: hover && !disabled ? "var(--accent-hover)" : "var(--accent)", color: "#fff",
      boxShadow: hover && !disabled ? "var(--shadow-md)" : "var(--shadow-sm)",
    },
    secondary: {
      background: hover && !disabled ? "var(--bg-card)" : "transparent",
      color: "var(--text)",
      borderColor: hover && !disabled ? "var(--border-strong)" : "var(--border-hover)",
      boxShadow: hover && !disabled ? "var(--shadow-sm)" : "none",
    },
    ghost: {
      background: hover && !disabled ? "var(--dropdown-hover-bg)" : "transparent",
      color: hover && !disabled ? "var(--text)" : "var(--text-secondary)",
    },
    danger: { background: "var(--red-muted)", color: "var(--score-low-text)", borderColor: "var(--score-low-border)" },
    success: { background: "var(--green-muted)", color: "var(--score-high-text)", borderColor: "var(--score-high-border)" },
  };
  return (
    <button
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      {...rest}
    >{children}</button>
  );
}
