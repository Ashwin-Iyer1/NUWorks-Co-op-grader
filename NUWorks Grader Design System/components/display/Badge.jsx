export function Badge({ variant = "neutral", children, style }) {
  const variants = {
    "score-high": { background: "var(--green-muted)", color: "var(--score-high-text)", fontSize: "0.78rem", padding: "3px 12px" },
    "score-medium": { background: "var(--yellow-muted)", color: "var(--score-med-text)", fontSize: "0.78rem", padding: "3px 12px" },
    "score-low": { background: "var(--red-muted)", color: "var(--score-low-text)", fontSize: "0.78rem", padding: "3px 12px" },
    "skill-matched": { background: "var(--accent-muted)", color: "var(--skill-matched-text)", fontSize: "0.74rem", padding: "2px 10px" },
    "skill-missing": { background: "var(--red-muted)", color: "var(--skill-missing-text)", fontSize: "0.74rem", padding: "2px 10px" },
    external: { background: "var(--red-muted)", color: "var(--score-low-text)", fontSize: "0.72rem", padding: "2px 10px" },
    disqualified: { background: "var(--bg-surface)", color: "var(--text-muted)", fontSize: "0.72rem", padding: "2px 10px", border: "1px solid var(--border)" },
    accent: { background: "var(--accent-muted)", color: "var(--accent)", fontSize: "0.76rem", padding: "4px 14px" },
    moss: { background: "var(--moss-tint)", color: "var(--moss)", fontSize: "0.76rem", padding: "4px 14px" },
    neutral: { background: "var(--bg-surface)", color: "var(--text-secondary)", fontSize: "0.76rem", padding: "3px 12px" },
  };
  const v = variants[variant] || variants.neutral;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px", borderRadius: "var(--radius-pill)",
      fontWeight: 600, fontFamily: "var(--font-sans)", whiteSpace: "nowrap", lineHeight: 1.5,
      ...v, ...style,
    }}>{children}</span>
  );
}

export function scoreVariant(score) {
  return score >= 70 ? "score-high" : score >= 40 ? "score-medium" : "score-low";
}
