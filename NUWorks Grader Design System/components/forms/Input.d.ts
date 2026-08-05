/** Labeled text/number input: sans, warm hairline border, clay focus ring. */
export interface InputProps {
  /** sentence-case label rendered above the field */
  label?: string;
  /** small muted hint below (e.g. "A good score is around 40-50%") */
  hint?: string;
  type?: string;
  value?: string | number;
  placeholder?: string;
  onChange?: (e: any) => void;
}
export declare function Input(props: InputProps): JSX.Element;
