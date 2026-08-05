export function Modal({ open = true, title, company, tags, children, actions, onClose, style }) {
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay-bg)", zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", overflowY: "auto", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", width: "100%", maxWidth: "760px", boxShadow: "var(--shadow-lg)", position: "relative", ...style }}>
        {onClose && (
          <button onClick={onClose} style={{ position: "absolute", top: "18px", right: "18px", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-muted)", width: "32px", height: "32px", borderRadius: "50%", fontSize: "1.05rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", zIndex: 1, transition: "all var(--transition)" }}>&times;</button>
        )}
        <div style={{ padding: "28px 30px 24px" }}>
          {title && <div style={{ fontSize: "1.35rem", fontWeight: 500, lineHeight: 1.25, marginBottom: "3px", fontFamily: "var(--font-serif)", letterSpacing: "-0.01em", color: "var(--text)", paddingRight: "44px" }}>{title}</div>}
          {company && <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontFamily: "var(--font-sans)", marginBottom: "16px" }}>{company}</div>}
          {tags && <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "20px" }}>{tags}</div>}
          {children}
          {actions && <div style={{ display: "flex", gap: "10px", marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--border)" }}>{actions}</div>}
        </div>
      </div>
    </div>
  );
}

export function ModalSection({ title, children, style }) {
  return (
    <div style={{ marginBottom: "20px", ...style }}>
      <div style={{ fontSize: "0.72rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--moss)", marginBottom: "8px", fontFamily: "var(--font-sans)" }}>{title}</div>
      <div style={{ fontSize: "0.9rem", lineHeight: 1.65, color: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}>{children}</div>
    </div>
  );
}
