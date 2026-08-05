/** Fully-rounded status pill: soft tint bg + colored text, no border. */
export interface BadgeProps {
  /** score-* for match %, skill-* for skill tags, external/disqualified for job flags, accent for hero badges */
  variant?: "score-high" | "score-medium" | "score-low" | "skill-matched" | "skill-missing" | "external" | "disqualified" | "accent" | "moss" | "neutral";
  children?: React.ReactNode;
}
export declare function Badge(props: BadgeProps): JSX.Element;
/** Maps a 0-100 score to score-high (>=70) / score-medium (>=40) / score-low */
export declare function scoreVariant(score: number): "score-high" | "score-medium" | "score-low";
