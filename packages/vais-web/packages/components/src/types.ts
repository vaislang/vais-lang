export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export interface InputProps {
  type?: "text" | "email" | "password" | "number";
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  name?: string;
}

export interface LinkProps {
  href: string;
  target?: "_self" | "_blank";
  prefetch?: boolean;
}

export interface HeadProps {
  title?: string;
  description?: string;
  og?: { title?: string; description?: string; image?: string };
}

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
}

export interface DropdownOption {
  label: string;
  value: string;
}

export interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export interface TableColumn {
  key: string;
  label: string;
  sortable?: boolean;
}

export interface TableProps {
  columns: TableColumn[];
  data: Record<string, unknown>[];
  sortable?: boolean;
}

export interface ToastProps {
  message: string;
  type?: "success" | "error" | "warning" | "info";
  duration?: number;
  onDismiss?: () => void;
}
