export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatBytes(value?: bigint | number | null) {
  if (value === null || value === undefined) {
    return "Unknown size";
  }

  const numericValue = typeof value === "bigint" ? Number(value) : value;
  const units = ["B", "KB", "MB", "GB", "TB"];
  let currentValue = numericValue;
  let unitIndex = 0;

  while (currentValue >= 1024 && unitIndex < units.length - 1) {
    currentValue /= 1024;
    unitIndex += 1;
  }

  return `${currentValue.toFixed(currentValue < 10 && unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
}

export function formatPercent(value?: number | null) {
  if (value === null || value === undefined) {
    return "0%";
  }

  return `${Math.round(value * 100)}%`;
}

export function formatRelativeDate(value?: Date | string | null) {
  if (!value) {
    return "Never";
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
