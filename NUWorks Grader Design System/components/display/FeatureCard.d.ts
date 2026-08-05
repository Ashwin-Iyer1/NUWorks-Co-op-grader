/** Marketing feature card: 38px tinted icon chip (clay or moss), sans-600 title and body. Hover lifts 2px. */
export interface FeatureCardProps {
  /** icon chip tint: clay (default) or moss */
  tone?: "clay" | "moss";
  /** an inline stroke-SVG ReactNode (preferred) or an icon-font class string */
  icon?: string | React.ReactNode;
  title?: string;
  children?: React.ReactNode;
}
export declare function FeatureCard(props: FeatureCardProps): JSX.Element;
