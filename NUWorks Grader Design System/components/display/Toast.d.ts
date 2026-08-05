/** Toast notification: soft rounded card (neutral) or tinted semantic (success/warning/error), rises + fades in. Position it fixed bottom-right (24px) yourself. */
export interface ToastProps {
  /** neutral (default) | success | warning | error */
  tone?: "neutral" | "success" | "warning" | "error";
  children?: React.ReactNode;
  /** false = hidden (translated down + transparent) */
  show?: boolean;
}
export declare function Toast(props: ToastProps): JSX.Element;
