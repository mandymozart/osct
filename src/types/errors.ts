/**
 * Error information structure
 */
export interface ErrorInfo {
  code: string;
  msg: string;
  type?: "critical" | "warning" | "info";
}

export type ErrorListener = (error: ErrorInfo) => void;
