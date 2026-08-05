import { Badge, scoreVariant } from "./Badge.jsx";
import { ScoreBar } from "./ScoreBar.jsx";

export function JobCard({ title, company, score, meta = [], matched = [], missing = [], flags = [], actions, style }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        background: "var(--bg-card)", borderRadius: "var(--radius-lg)", padding: "18px",
        border: "1px solid var(--border)",
        boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-sm)",
        transform: hover ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--transition), transform var(--transition)",
        display: "flex", flexDirection: "column", gap: "9px", position: "relative", ...style,
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "0.98rem", fontWeight: 600, lineHeight: 1.35, fontFamily: "var(--font-sans)", color: "var(--text)" }}>{title}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontFamily: "var(--font-sans)", marginTop: "1px" }}>{company}</div>
        </div>
        {typeof score === "number" && <Badge variant={scoreVariant(score)}>{score}% match</Badge>}
      </div>
      {typeof score === "number" && <ScoreBar score={score} />}
      {(meta.length > 0 || flags.length > 0) && (
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", fontSize: "0.78rem", color: "var(--text-muted)", fontFamily: "var(--font-sans)" }}>
          {meta.map((m, i) => <span key={i}>{m}</span>)}
          {flags.includes("external") && <Badge variant="external">External</Badge>}
          {flags.includes("disqualified") && <Badge variant="disqualified">Ineligible</Badge>}
        </div>
      )}
      {(matched.length > 0 || missing.length > 0) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
          {matched.map((s) => <Badge key={s} variant="skill-matched">{s}</Badge>)}
          {missing.map((s) => <Badge key={s} variant="skill-missing">{s}</Badge>)}
        </div>
      )}
      {actions && <div style={{ display: "flex", gap: "8px", marginTop: "auto", justifyContent: "flex-end" }}>{actions}</div>}
    </div>
  );
}
