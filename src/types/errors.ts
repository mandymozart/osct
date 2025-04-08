/**
 * Error information structure
 */
export interface ErrorInfo {
  code: string;
  msg: string;
  type?: "critical" | "warning" | "info";
  details?: any;
}

export type ErrorListener = (error: ErrorInfo) => void;
