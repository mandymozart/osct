export interface ApiResponse<T> {
  data?: T;
  error?: ErrorInfo;
  loading?: boolean;
}

export interface RetryConfig {
  attempts: number;
  delay: number;
  exponential?: boolean;
}
