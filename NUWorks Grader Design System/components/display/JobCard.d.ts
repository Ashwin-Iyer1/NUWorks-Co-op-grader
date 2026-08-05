/**
 * Job listing card: soft white card, rounded score pill + score bar, skill tag pills.
 * @startingPoint section="Components" subtitle="Job listing card with match score and skill tags" viewport="420x230"
 */
export interface JobCardProps {
  title?: string;
  /** rendered quiet sans under the title */
  company?: string;
  /** 0-100; renders the score pill + bar when present */
  score?: number;
  /** meta strings, e.g. ["Boston, MA", "Posted 3d ago"] */
  meta?: string[];
  /** matched skill tags (ember) */
  matched?: string[];
  /** missing skill tags (red) */
  missing?: string[];
  /** "external" | "disqualified" flags */
  flags?: Array<"external" | "disqualified">;
  /** right-aligned action buttons */
  actions?: React.ReactNode;
}
export declare function JobCard(props: JobCardProps): JSX.Element;
