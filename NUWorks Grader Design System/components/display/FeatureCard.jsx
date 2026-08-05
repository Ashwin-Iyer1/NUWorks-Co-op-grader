export function FeatureCard({ icon, title, children, tone = "clay", style }) {
  const [hover, setHover] = React.useState(false);
  const tones = {
    clay: { background: "var(--accent-muted)", color: "var(--accent)" },
    moss: { background: "var(--moss-tint)", color: "var(--moss)" },
  };
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--bg-card)", padding: "26px 24px", borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-sm)",
        transition: "box-shadow var(--transition), transform var(--transition)",
        transform: hover ? "translateY(-2px)" : "none", ...style,
      }}>
      {icon && (
        <div style={{ width: "38px", height: "38px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px", fontSize: "1rem", ...(tones[tone] || tones.clay) }}>
          {typeof icon === "string" ? <i className={icon}></i> : icon}
        </div>
      )}
      <h3 style={{ fontSize: "0.98rem", margin: "0 0 5px", fontWeight: 600, fontFamily: "var(--font-sans)", color: "var(--text)" }}>{title}</h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.6, fontFamily: "var(--font-sans)", margin: 0 }}>{children}</p>
    </div>
  );
}
