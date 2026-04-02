type DebugDetails =
  | Record<string, unknown>
  | unknown[]
  | string
  | number
  | boolean
  | null
  | undefined;

function isDebugLoggingEnabled() {
  const raw = process.env.DEBUG_REQUEST_LOGS?.trim().toLowerCase();

  if (!raw) {
    return process.env.NODE_ENV !== "production";
  }

  return ["1", "true", "yes", "on"].includes(raw);
}

function normalizeDetails(details: DebugDetails) {
  if (details instanceof Error) {
    return {
      name: details.name,
      message: details.message,
      stack: details.stack,
    };
  }

  return details;
}

function emit(level: "log" | "warn" | "error", scope: string, message: string, details?: DebugDetails) {
  if (!isDebugLoggingEnabled()) {
    return;
  }

  const prefix = `[debug:${scope}] ${new Date().toISOString()} ${message}`;

  if (details === undefined) {
    console[level](prefix);
    return;
  }

  console[level](prefix, normalizeDetails(details));
}

export function debugLog(scope: string, message: string, details?: DebugDetails) {
  emit("log", scope, message, details);
}

export function debugWarn(scope: string, message: string, details?: DebugDetails) {
  emit("warn", scope, message, details);
}

export function debugError(scope: string, message: string, details?: DebugDetails) {
  emit("error", scope, message, details);
}
