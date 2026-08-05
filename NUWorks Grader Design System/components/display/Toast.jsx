export function Toast({ children, show = true, tone = "neutral", style }) {
  const tones = {
    neutral: { background: "var(--bg-elevated)", color: "var(--text)", border: "1px solid var(--border)" },
    success: { background: "var(--green-muted)", color: "var(--score-high-text)", border: "1px solid var(--score-high-border)" },
    warning: { background: "var(--yellow-muted)", color: "var(--score-med-text)", border: "1px solid var(--score-med-border)" },
    error: { background: "var(--red-muted)", color: "var(--score-low-text)", border: "1px solid var(--score-low-border)" },
  };
  return (
    <div style={{
      borderRadius: "var(--radius)", padding: "11px 18px", fontSize: "0.85rem", fontWeight: 500,
      fontFamily: "var(--font-sans)", boxShadow: "var(--shadow-lg)",
      transform: show ? "translateY(0)" : "translateY(100px)", opacity: show ? 1 : 0,
      transition: "all 0.3s ease", display: "inline-flex", alignItems: "center", gap: "9px",
      ...(tones[tone] || tones.neutral), ...style,
    }}>{children}</div>
  );
}
