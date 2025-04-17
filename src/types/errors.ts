/**
 * Error information structure
 */
export interface ErrorInfo {
  code: string;
  msg: string;
  type?: "critical" | "warning" | "info";
  details?: any;
  action?: {
    text: string;
    callback: () => void;
  };
}

export type ErrorListener = (error: ErrorInfo) => void;
