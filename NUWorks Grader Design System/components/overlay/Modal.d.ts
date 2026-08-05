/** Job-detail modal: soft blurred overlay, rounded white card, serif title, moss eyebrow section headers. */
export interface ModalProps {
  open?: boolean;
  title?: string;
  /** quiet subtitle line under the title */
  company?: string;
  /** row of Badge elements under the header */
  tags?: React.ReactNode;
  children?: React.ReactNode;
  /** footer buttons above a hairline top border */
  actions?: React.ReactNode;
  onClose?: () => void;
}
export declare function Modal(props: ModalProps): JSX.Element;
export interface ModalSectionProps {
  /** micro moss eyebrow section label */
  title?: string;
  children?: React.ReactNode;
}
export declare function ModalSection(props: ModalSectionProps): JSX.Element;
