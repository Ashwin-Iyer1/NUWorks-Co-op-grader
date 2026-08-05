/** 6px rounded clay fetch-progress bar with a quiet status row above; plus the brand Spinner. */
export interface ProgressBarProps {
  /** 0-100 */
  progress?: number;
  /** left status text, e.g. "Fetching jobs..." */
  status?: string;
  /** right counter, e.g. "180 / 400" */
  count?: string;
}
export declare function ProgressBar(props: ProgressBarProps): JSX.Element;
export interface SpinnerProps {
  /** px, default 18 (use 28 for large) */
  size?: number;
}
export declare function Spinner(props: SpinnerProps): JSX.Element;
