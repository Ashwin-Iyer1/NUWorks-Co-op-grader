/** Labeled native select styled to match Input. */
export interface SelectProps {
  label?: string;
  /** strings or {value, label} pairs */
  options?: Array<string | { value: string; label: string }>;
  value?: string;
  onChange?: (e: any) => void;
}
export declare function Select(props: SelectProps): JSX.Element;
