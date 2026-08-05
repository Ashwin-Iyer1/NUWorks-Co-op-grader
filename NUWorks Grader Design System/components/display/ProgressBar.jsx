export function ProgressBar({ progress = 0, status, count, style }) {
  return (
    <div style={{ width: "100%", ...style }}>
      {(status || count) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "6px", fontFamily: "var(--font-sans)" }}>
          <span>{status}</span><span>{count}</span>
        </div>
      )}
      <div style={{ width: "100%", height: "6px", background: "var(--bg-surface)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ height: "100%", background: "var(--accent)", borderRadius: "3px", transition: "width 0.4s var(--transition)", width: `${Math.max(0, Math.min(100, progress))}%` }}></div>
      </div>
    </div>
  );
}

export function Spinner({ size = 18, style }) {
  return (
    <span style={{ width: size, height: size, border: `${size > 20 ? 3 : 2}px solid var(--border)`, borderTopColor: "var(--accent)", borderRadius: "50%", display: "inline-block", flexShrink: 0, animation: "nuwSpin 0.6s linear infinite", boxSizing: "border-box", ...style }}>
      <style>{`@keyframes nuwSpin{to{transform:rotate(360deg)}}`}</style>
    </span>
  );
}
