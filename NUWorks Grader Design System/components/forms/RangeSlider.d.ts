/** Round-thumbed range slider (5px rounded track, 17px round clay thumb) with live value in the label. */
export interface RangeSliderProps {
  label?: string;
  value?: number;
  min?: number;
  max?: number;
  step?: number;
  /** suffix shown after the value, default "%" */
  unit?: string;
  hint?: string;
  onChange?: (e: any) => void;
}
export declare function RangeSlider(props: RangeSliderProps): JSX.Element;
