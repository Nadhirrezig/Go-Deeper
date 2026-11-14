/** Button looks shared by links and buttons (Tailwind classes). */
const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 h-10 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none";

export const buttonClass = {
  primary: `${base} bg-zinc-900 text-white shadow-[0_8px_18px_-8px_rgb(0_0_0/0.6)] hover:bg-zinc-800`,
  secondary: `${base} glass hover:bg-white/80`,
  danger: `${base} bg-danger text-white hover:brightness-110`,
  ghost: `${base} hover:bg-zinc-900/5`,
} as const;

export const inputClass =
  "h-10 w-full rounded-xl border border-border bg-white/70 px-3 text-[15px] outline-none focus:border-zinc-400";
