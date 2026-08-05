/* @ds-bundle: {"format":4,"namespace":"NUWorksGraderDesignSystem_866ea6","components":[{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"FeatureCard","sourcePath":"components/display/FeatureCard.jsx"},{"name":"JobCard","sourcePath":"components/display/JobCard.jsx"},{"name":"ProgressBar","sourcePath":"components/display/ProgressBar.jsx"},{"name":"Spinner","sourcePath":"components/display/ProgressBar.jsx"},{"name":"ScoreBar","sourcePath":"components/display/ScoreBar.jsx"},{"name":"StatCard","sourcePath":"components/display/StatCard.jsx"},{"name":"Toast","sourcePath":"components/display/Toast.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"RangeSlider","sourcePath":"components/forms/RangeSlider.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Modal","sourcePath":"components/overlay/Modal.jsx"},{"name":"ModalSection","sourcePath":"components/overlay/Modal.jsx"}],"sourceHashes":{"components/display/Badge.jsx":"09726b1acfa2","components/display/FeatureCard.jsx":"e96ff07e0c84","components/display/JobCard.jsx":"3ceb6bbac904","components/display/ProgressBar.jsx":"22514b483536","components/display/ScoreBar.jsx":"40647d10136b","components/display/StatCard.jsx":"c5d4fbb7f39e","components/display/Toast.jsx":"749fd165ca46","components/forms/Button.jsx":"ba1a38f77835","components/forms/Checkbox.jsx":"5b2acc1eb03b","components/forms/Input.jsx":"2504feff460c","components/forms/RangeSlider.jsx":"1ce2d319b068","components/forms/Select.jsx":"7ca6629bb542","components/overlay/Modal.jsx":"9e4dd954cda7"},"inlinedExternals":[],"unexposedExports":[{"name":"scoreVariant","sourcePath":"components/display/Badge.jsx"}]} */

(() => {

const __ds_ns = (window.NUWorksGraderDesignSystem_866ea6 = window.NUWorksGraderDesignSystem_866ea6 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/display/Badge.jsx
try { (() => {
function Badge({
  variant = "neutral",
  children,
  style
}) {
  const variants = {
    "score-high": {
      background: "var(--green-muted)",
      color: "var(--score-high-text)",
      fontSize: "0.78rem",
      padding: "3px 12px"
    },
    "score-medium": {
      background: "var(--yellow-muted)",
      color: "var(--score-med-text)",
      fontSize: "0.78rem",
      padding: "3px 12px"
    },
    "score-low": {
      background: "var(--red-muted)",
      color: "var(--score-low-text)",
      fontSize: "0.78rem",
      padding: "3px 12px"
    },
    "skill-matched": {
      background: "var(--accent-muted)",
      color: "var(--skill-matched-text)",
      fontSize: "0.74rem",
      padding: "2px 10px"
    },
    "skill-missing": {
      background: "var(--red-muted)",
      color: "var(--skill-missing-text)",
      fontSize: "0.74rem",
      padding: "2px 10px"
    },
    external: {
      background: "var(--red-muted)",
      color: "var(--score-low-text)",
      fontSize: "0.72rem",
      padding: "2px 10px"
    },
    disqualified: {
      background: "var(--bg-surface)",
      color: "var(--text-muted)",
      fontSize: "0.72rem",
      padding: "2px 10px",
      border: "1px solid var(--border)"
    },
    accent: {
      background: "var(--accent-muted)",
      color: "var(--accent)",
      fontSize: "0.76rem",
      padding: "4px 14px"
    },
    moss: {
      background: "var(--moss-tint)",
      color: "var(--moss)",
      fontSize: "0.76rem",
      padding: "4px 14px"
    },
    neutral: {
      background: "var(--bg-surface)",
      color: "var(--text-secondary)",
      fontSize: "0.76rem",
      padding: "3px 12px"
    }
  };
  const v = variants[variant] || variants.neutral;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "5px",
      borderRadius: "var(--radius-pill)",
      fontWeight: 600,
      fontFamily: "var(--font-sans)",
      whiteSpace: "nowrap",
      lineHeight: 1.5,
      ...v,
      ...style
    }
  }, children);
}
function scoreVariant(score) {
  return score >= 70 ? "score-high" : score >= 40 ? "score-medium" : "score-low";
}
Object.assign(__ds_scope, { Badge, scoreVariant });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/FeatureCard.jsx
try { (() => {
function FeatureCard({
  icon,
  title,
  children,
  tone = "clay",
  style
}) {
  const [hover, setHover] = React.useState(false);
  const tones = {
    clay: {
      background: "var(--accent-muted)",
      color: "var(--accent)"
    },
    moss: {
      background: "var(--moss-tint)",
      color: "var(--moss)"
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: "var(--bg-card)",
      padding: "26px 24px",
      borderRadius: "var(--radius-lg)",
      border: "1px solid var(--border)",
      boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-sm)",
      transition: "box-shadow var(--transition), transform var(--transition)",
      transform: hover ? "translateY(-2px)" : "none",
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: "38px",
      height: "38px",
      borderRadius: "10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: "16px",
      fontSize: "1rem",
      ...(tones[tone] || tones.clay)
    }
  }, typeof icon === "string" ? /*#__PURE__*/React.createElement("i", {
    className: icon
  }) : icon), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: "0.98rem",
      margin: "0 0 5px",
      fontWeight: 600,
      fontFamily: "var(--font-sans)",
      color: "var(--text)"
    }
  }, title), /*#__PURE__*/React.createElement("p", {
    style: {
      color: "var(--text-secondary)",
      fontSize: "0.88rem",
      lineHeight: 1.6,
      fontFamily: "var(--font-sans)",
      margin: 0
    }
  }, children));
}
Object.assign(__ds_scope, { FeatureCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/FeatureCard.jsx", error: String((e && e.message) || e) }); }

// components/display/ProgressBar.jsx
try { (() => {
function ProgressBar({
  progress = 0,
  status,
  count,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      ...style
    }
  }, (status || count) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontSize: "0.78rem",
      fontWeight: 500,
      color: "var(--text-secondary)",
      marginBottom: "6px",
      fontFamily: "var(--font-sans)"
    }
  }, /*#__PURE__*/React.createElement("span", null, status), /*#__PURE__*/React.createElement("span", null, count)), /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: "6px",
      background: "var(--bg-surface)",
      borderRadius: "3px",
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      background: "var(--accent)",
      borderRadius: "3px",
      transition: "width 0.4s var(--transition)",
      width: `${Math.max(0, Math.min(100, progress))}%`
    }
  })));
}
function Spinner({
  size = 18,
  style
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      border: `${size > 20 ? 3 : 2}px solid var(--border)`,
      borderTopColor: "var(--accent)",
      borderRadius: "50%",
      display: "inline-block",
      flexShrink: 0,
      animation: "nuwSpin 0.6s linear infinite",
      boxSizing: "border-box",
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, `@keyframes nuwSpin{to{transform:rotate(360deg)}}`));
}
Object.assign(__ds_scope, { ProgressBar, Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/display/ScoreBar.jsx
try { (() => {
function ScoreBar({
  score = 0,
  style
}) {
  const color = score >= 70 ? "var(--green)" : score >= 40 ? "var(--yellow)" : "var(--red)";
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: "100%",
      height: "5px",
      background: "var(--bg-surface)",
      borderRadius: "3px",
      overflow: "hidden",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      height: "100%",
      width: `${Math.max(0, Math.min(100, score))}%`,
      background: color,
      borderRadius: "3px",
      transition: "width 0.5s ease"
    }
  }));
}
Object.assign(__ds_scope, { ScoreBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/ScoreBar.jsx", error: String((e && e.message) || e) }); }

// components/display/JobCard.jsx
try { (() => {
function JobCard({
  title,
  company,
  score,
  meta = [],
  matched = [],
  missing = [],
  flags = [],
  actions,
  style
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      background: "var(--bg-card)",
      borderRadius: "var(--radius-lg)",
      padding: "18px",
      border: "1px solid var(--border)",
      boxShadow: hover ? "var(--shadow-md)" : "var(--shadow-sm)",
      transform: hover ? "translateY(-2px)" : "none",
      transition: "box-shadow var(--transition), transform var(--transition)",
      display: "flex",
      flexDirection: "column",
      gap: "9px",
      position: "relative",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: "8px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "0.98rem",
      fontWeight: 600,
      lineHeight: 1.35,
      fontFamily: "var(--font-sans)",
      color: "var(--text)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "0.8rem",
      color: "var(--text-muted)",
      fontFamily: "var(--font-sans)",
      marginTop: "1px"
    }
  }, company)), typeof score === "number" && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    variant: __ds_scope.scoreVariant(score)
  }, score, "% match")), typeof score === "number" && /*#__PURE__*/React.createElement(__ds_scope.ScoreBar, {
    score: score
  }), (meta.length > 0 || flags.length > 0) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "10px",
      flexWrap: "wrap",
      alignItems: "center",
      fontSize: "0.78rem",
      color: "var(--text-muted)",
      fontFamily: "var(--font-sans)"
    }
  }, meta.map((m, i) => /*#__PURE__*/React.createElement("span", {
    key: i
  }, m)), flags.includes("external") && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    variant: "external"
  }, "External"), flags.includes("disqualified") && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    variant: "disqualified"
  }, "Ineligible")), (matched.length > 0 || missing.length > 0) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "5px"
    }
  }, matched.map(s => /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    key: s,
    variant: "skill-matched"
  }, s)), missing.map(s => /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    key: s,
    variant: "skill-missing"
  }, s))), actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "8px",
      marginTop: "auto",
      justifyContent: "flex-end"
    }
  }, actions));
}
Object.assign(__ds_scope, { JobCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/JobCard.jsx", error: String((e && e.message) || e) }); }

// components/display/StatCard.jsx
try { (() => {
function StatCard({
  value,
  label,
  color,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      padding: "16px 18px",
      flex: 1,
      minWidth: "120px",
      boxShadow: "var(--shadow-sm)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "1.5rem",
      fontWeight: 600,
      fontFamily: "var(--font-serif)",
      letterSpacing: "-0.01em",
      lineHeight: 1.2,
      color: color || "var(--text)"
    }
  }, value), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "0.78rem",
      color: "var(--text-muted)",
      marginTop: "3px",
      fontFamily: "var(--font-sans)"
    }
  }, label));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/display/Toast.jsx
try { (() => {
function Toast({
  children,
  show = true,
  tone = "neutral",
  style
}) {
  const tones = {
    neutral: {
      background: "var(--bg-elevated)",
      color: "var(--text)",
      border: "1px solid var(--border)"
    },
    success: {
      background: "var(--green-muted)",
      color: "var(--score-high-text)",
      border: "1px solid var(--score-high-border)"
    },
    warning: {
      background: "var(--yellow-muted)",
      color: "var(--score-med-text)",
      border: "1px solid var(--score-med-border)"
    },
    error: {
      background: "var(--red-muted)",
      color: "var(--score-low-text)",
      border: "1px solid var(--score-low-border)"
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      borderRadius: "var(--radius)",
      padding: "11px 18px",
      fontSize: "0.85rem",
      fontWeight: 500,
      fontFamily: "var(--font-sans)",
      boxShadow: "var(--shadow-lg)",
      transform: show ? "translateY(0)" : "translateY(100px)",
      opacity: show ? 1 : 0,
      transition: "all 0.3s ease",
      display: "inline-flex",
      alignItems: "center",
      gap: "9px",
      ...(tones[tone] || tones.neutral),
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    borderRadius: "var(--radius-sm)",
    fontWeight: 600,
    fontFamily: "var(--font-sans)",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "all var(--transition)",
    whiteSpace: "nowrap",
    border: "1px solid transparent",
    opacity: disabled ? 0.45 : 1,
    textDecoration: "none",
    transform: active && !disabled ? "scale(0.98)" : "none"
  };
  const sizes = {
    sm: {
      padding: "7px 16px",
      fontSize: "0.85rem"
    },
    md: {
      padding: "10px 22px",
      fontSize: "0.9rem"
    },
    lg: {
      padding: "12px 28px",
      fontSize: "0.95rem"
    }
  };
  const variants = {
    primary: {
      background: hover && !disabled ? "var(--accent-hover)" : "var(--accent)",
      color: "#fff",
      boxShadow: hover && !disabled ? "var(--shadow-md)" : "var(--shadow-sm)"
    },
    secondary: {
      background: hover && !disabled ? "var(--bg-card)" : "transparent",
      color: "var(--text)",
      borderColor: hover && !disabled ? "var(--border-strong)" : "var(--border-hover)",
      boxShadow: hover && !disabled ? "var(--shadow-sm)" : "none"
    },
    ghost: {
      background: hover && !disabled ? "var(--dropdown-hover-bg)" : "transparent",
      color: hover && !disabled ? "var(--text)" : "var(--text-secondary)"
    },
    danger: {
      background: "var(--red-muted)",
      color: "var(--score-low-text)",
      borderColor: "var(--score-low-border)"
    },
    success: {
      background: "var(--green-muted)",
      color: "var(--score-high-text)",
      borderColor: "var(--score-high-border)"
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setActive(false);
    },
    onMouseDown: () => setActive(true),
    onMouseUp: () => setActive(false),
    style: {
      ...base,
      ...sizes[size],
      ...variants[variant],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Checkbox({
  label,
  checked,
  onChange,
  style,
  ...rest
}) {
  const id = React.useId();
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "9px",
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    id: id,
    checked: checked,
    onChange: onChange,
    style: {
      width: "16px",
      height: "16px",
      cursor: "pointer",
      accentColor: "var(--accent)",
      margin: 0
    }
  }, rest)), /*#__PURE__*/React.createElement("label", {
    htmlFor: id,
    style: {
      cursor: "pointer",
      fontSize: "0.88rem",
      color: "var(--text-secondary)",
      fontFamily: "var(--font-sans)"
    }
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Input({
  label,
  hint,
  type = "text",
  style,
  inputStyle,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      width: "100%",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: "0.8rem",
      color: "var(--text-secondary)",
      fontWeight: 600,
      fontFamily: "var(--font-sans)"
    }
  }, label), /*#__PURE__*/React.createElement("input", _extends({
    type: type,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      width: "100%",
      boxSizing: "border-box",
      padding: "9px 12px",
      background: "var(--input-bg)",
      border: `1px solid ${focus ? "var(--accent)" : hover ? "var(--border-strong)" : "var(--border-hover)"}`,
      boxShadow: focus ? "0 0 0 3px var(--accent-glow)" : "var(--shadow-sm)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text)",
      fontSize: "0.9rem",
      fontFamily: "var(--font-sans)",
      outline: "none",
      transition: "border-color var(--transition), box-shadow var(--transition)",
      ...inputStyle
    }
  }, rest)), hint && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "0.78rem",
      color: "var(--text-muted)",
      margin: 0,
      fontFamily: "var(--font-sans)"
    }
  }, hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/RangeSlider.jsx
try { (() => {
function RangeSlider({
  label,
  value = 0,
  min = 0,
  max = 100,
  step = 1,
  unit = "%",
  hint,
  onChange,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      width: "100%",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: "0.8rem",
      color: "var(--text-secondary)",
      fontWeight: 600,
      fontFamily: "var(--font-sans)"
    }
  }, label, ": ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text)"
    }
  }, value, unit)), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: min,
    max: max,
    step: step,
    value: value,
    onChange: onChange,
    className: "nuw-range",
    style: {
      WebkitAppearance: "none",
      appearance: "none",
      background: "transparent",
      width: "100%",
      height: "24px",
      cursor: "pointer"
    }
  }), hint && /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: "0.78rem",
      color: "var(--text-muted)",
      margin: 0,
      fontFamily: "var(--font-sans)"
    }
  }, hint), /*#__PURE__*/React.createElement("style", null, `
        .nuw-range::-webkit-slider-runnable-track{width:100%;height:5px;cursor:pointer;background:var(--border);border-radius:3px}
        .nuw-range::-webkit-slider-thumb{-webkit-appearance:none;height:17px;width:17px;border-radius:50%;background:var(--accent);cursor:pointer;margin-top:-6px;border:2px solid var(--bg-card);box-shadow:var(--shadow-sm)}
        .nuw-range::-webkit-slider-thumb:hover{box-shadow:0 0 0 4px var(--accent-glow)}
        .nuw-range::-moz-range-track{height:5px;background:var(--border);border-radius:3px}
        .nuw-range::-moz-range-thumb{height:17px;width:17px;border-radius:50%;background:var(--accent);border:2px solid var(--bg-card)}
      `));
}
Object.assign(__ds_scope, { RangeSlider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/RangeSlider.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function Select({
  label,
  options = [],
  style,
  selectStyle,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      width: "100%",
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    style: {
      fontSize: "0.8rem",
      color: "var(--text-secondary)",
      fontWeight: 600,
      fontFamily: "var(--font-sans)"
    }
  }, label), /*#__PURE__*/React.createElement("select", _extends({
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: "100%",
      boxSizing: "border-box",
      padding: "9px 10px",
      background: "var(--input-bg)",
      border: `1px solid ${focus ? "var(--accent)" : "var(--border-hover)"}`,
      boxShadow: focus ? "0 0 0 3px var(--accent-glow)" : "var(--shadow-sm)",
      borderRadius: "var(--radius-sm)",
      color: "var(--text)",
      fontSize: "0.9rem",
      fontFamily: "var(--font-sans)",
      outline: "none",
      transition: "border-color var(--transition), box-shadow var(--transition)",
      ...selectStyle
    }
  }, rest), options.map(o => {
    const opt = typeof o === "string" ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value,
      style: {
        background: "var(--bg-card)",
        color: "var(--text)"
      }
    }, opt.label);
  })));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Modal.jsx
try { (() => {
function Modal({
  open = true,
  title,
  company,
  tags,
  children,
  actions,
  onClose,
  style
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--overlay-bg)",
      zIndex: 2000,
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      padding: "48px 20px",
      overflowY: "auto",
      backdropFilter: "blur(4px)",
      WebkitBackdropFilter: "blur(4px)"
    },
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      background: "var(--bg-card)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)",
      width: "100%",
      maxWidth: "760px",
      boxShadow: "var(--shadow-lg)",
      position: "relative",
      ...style
    }
  }, onClose && /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: {
      position: "absolute",
      top: "18px",
      right: "18px",
      background: "var(--bg-surface)",
      border: "1px solid var(--border)",
      color: "var(--text-muted)",
      width: "32px",
      height: "32px",
      borderRadius: "50%",
      fontSize: "1.05rem",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "var(--font-sans)",
      zIndex: 1,
      transition: "all var(--transition)"
    }
  }, "\xD7"), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "28px 30px 24px"
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "1.35rem",
      fontWeight: 500,
      lineHeight: 1.25,
      marginBottom: "3px",
      fontFamily: "var(--font-serif)",
      letterSpacing: "-0.01em",
      color: "var(--text)",
      paddingRight: "44px"
    }
  }, title), company && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "0.85rem",
      color: "var(--text-muted)",
      fontFamily: "var(--font-sans)",
      marginBottom: "16px"
    }
  }, company), tags && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      marginBottom: "20px"
    }
  }, tags), children, actions && /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "10px",
      marginTop: "22px",
      paddingTop: "18px",
      borderTop: "1px solid var(--border)"
    }
  }, actions))));
}
function ModalSection({
  title,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: "20px",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "0.72rem",
      fontWeight: 600,
      textTransform: "uppercase",
      letterSpacing: "0.14em",
      color: "var(--moss)",
      marginBottom: "8px",
      fontFamily: "var(--font-sans)"
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: "0.9rem",
      lineHeight: 1.65,
      color: "var(--text-secondary)",
      fontFamily: "var(--font-sans)"
    }
  }, children));
}
Object.assign(__ds_scope, { Modal, ModalSection });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Modal.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.FeatureCard = __ds_scope.FeatureCard;

__ds_ns.JobCard = __ds_scope.JobCard;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.ScoreBar = __ds_scope.ScoreBar;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.RangeSlider = __ds_scope.RangeSlider;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.ModalSection = __ds_scope.ModalSection;

})();
