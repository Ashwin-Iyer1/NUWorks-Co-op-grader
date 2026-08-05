export function ScoreBar({ score = 0, style }) {
  const color = score >= 70 ? "var(--green)" : score >= 40 ? "var(--yellow)" : "var(--red)";
  return (
    <div style={{ width: "100%", height: "5px", background: "var(--bg-surface)", borderRadius: "3px", overflow: "hidden", ...style }}>
      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, score))}%`, background: color, borderRadius: "3px", transition: "width 0.5s ease" }}></div>
    </div>
  );
}
