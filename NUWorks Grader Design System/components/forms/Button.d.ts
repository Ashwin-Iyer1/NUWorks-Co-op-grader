/**
 * Natural Professional button: Source Sans 600, sentence case, 8px radius, soft shadow.
 * @startingPoint section="Components" subtitle="Primary, secondary, ghost, danger, success buttons" viewport="700x260"
 */
export interface ButtonProps {
  /** primary = solid clay; secondary = quiet outline; ghost = text-only; danger/success = tinted semantic */
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  children?: React.ReactNode;
  onClick?: () => void;
}
export declare function Button(props: ButtonProps): JSX.Element;
