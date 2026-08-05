export function StatCard({ value, label, color, style }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "16px 18px", flex: 1, minWidth: "120px", boxShadow: "var(--shadow-sm)", ...style }}>
      <div style={{ fontSize: "1.5rem", fontWeight: 600, fontFamily: "var(--font-serif)", letterSpacing: "-0.01em", lineHeight: 1.2, color: color || "var(--text)" }}>{value}</div>
      <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "3px", fontFamily: "var(--font-sans)" }}>{label}</div>
    </div>
  );
}
