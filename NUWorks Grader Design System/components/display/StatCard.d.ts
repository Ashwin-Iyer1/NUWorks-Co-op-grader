/** Dashboard stat: serif (Source Serif 4) number over quiet sans label, soft white card. */
export interface StatCardProps {
  value?: React.ReactNode;
  label?: string;
  /** optional value color, e.g. var(--score-high-text) */
  color?: string;
}
export declare function StatCard(props: StatCardProps): JSX.Element;
