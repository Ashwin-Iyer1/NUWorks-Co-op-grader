export function RangeSlider({ label, value = 0, min = 0, max = 100, step = 1, unit = "%", hint, onChange, style }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", width: "100%", ...style }}>
      {label && <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600, fontFamily: "var(--font-sans)" }}>
        {label}: <span style={{ color: "var(--text)" }}>{value}{unit}</span>
      </label>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} className="nuw-range"
        style={{ WebkitAppearance: "none", appearance: "none", background: "transparent", width: "100%", height: "24px", cursor: "pointer" }} />
      {hint && <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: 0, fontFamily: "var(--font-sans)" }}>{hint}</p>}
      <style>{`
        .nuw-range::-webkit-slider-runnable-track{width:100%;height:5px;cursor:pointer;background:var(--border);border-radius:3px}
        .nuw-range::-webkit-slider-thumb{-webkit-appearance:none;height:17px;width:17px;border-radius:50%;background:var(--accent);cursor:pointer;margin-top:-6px;border:2px solid var(--bg-card);box-shadow:var(--shadow-sm)}
        .nuw-range::-webkit-slider-thumb:hover{box-shadow:0 0 0 4px var(--accent-glow)}
        .nuw-range::-moz-range-track{height:5px;background:var(--border);border-radius:3px}
        .nuw-range::-moz-range-thumb{height:17px;width:17px;border-radius:50%;background:var(--accent);border:2px solid var(--bg-card)}
      `}</style>
    </div>
  );
}
