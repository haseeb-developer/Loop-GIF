export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const base = "inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none " +
  "transition duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-fg hover:brightness-110",
  secondary: "bg-raised text-fg border border-line hover:bg-hover hover:border-line-strong",
  ghost: "text-dim hover:text-fg hover:bg-hover",
  danger: "bg-raised text-danger border border-line hover:border-danger/60 hover:bg-danger/10",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
  icon: "h-8 w-8",
};

export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra = ""): string {
  return [base, variants[variant], sizes[size], extra].filter(Boolean).join(" ");
}
