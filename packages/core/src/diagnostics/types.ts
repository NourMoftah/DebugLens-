/** A source position extracted from a stack-trace frame. */
export interface SourceLocation {
  column: number;
  filePath: string;
  line: number;
}

/** The normalized error heading extracted from raw diagnostic text. */
export interface ErrorInfo {
  message: string;
  name: string;
}

/** A single V8-style stack-trace frame. */
export interface StackFrame {
  column?: number;
  filePath?: string;
  functionName?: string;
  isInternal: boolean;
  isNative: boolean;
  line?: number;
}

/** A parsed error and the stack information that accompanied it. */
export interface Diagnostic {
  error: ErrorInfo;
  primaryLocation?: SourceLocation;
  stack: StackFrame[];
}
