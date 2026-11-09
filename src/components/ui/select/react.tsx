/**
 * The Bejamas Select for React islands: same markup and classes as the .astro
 * parts, driven by the same @data-slot/select controller.
 */
import { useEffect, useRef } from "react";
import { createSelect } from "@/lib/select";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string; disabled?: boolean };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "default";
  className?: string;
};

const chevron = "m6 9l6 6l6-6";

export function Select({ value, onChange, options, id, placeholder = "", disabled = false, size = "default", className, ...aria }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createSelect> | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };
  // The controller reads items once, so new options mean a fresh root (see `key` below).
  const signature = options.map((o) => `${o.value}\u0000${o.label}\u0000${o.disabled ? 1 : 0}`).join("\u0001");

  useEffect(() => {
    const c = createSelect(root.current!, { defaultValue: value, onValueChange: (v) => v !== null && v !== latest.current.value && latest.current.onChange(v) });
    controller.current = c;
    return () => c.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `value` is synced by the effect below
  }, [signature, disabled]);

  useEffect(() => {
    if (controller.current && controller.current.value !== value) controller.current.select(value);
  }, [value]);

  return (
    <div
      key={`${signature}${disabled}`}
      ref={root}
      data-slot="select"
      data-mount-strategy="eager"
      data-placeholder={placeholder}
      data-disabled={disabled ? "" : undefined}
      data-size={size}
      className={cn("group/select relative inline-block", className)}
    >
      <button
        type="button"
        id={id}
        aria-label={aria["aria-label"]}
        disabled={disabled}
        data-slot="select-trigger"
        data-size={size}
        className={cn(
          "border-input data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 focus-visible:border-ring focus-visible:ring-ring/50 gap-1.5 rounded-lg border bg-transparent py-2 px-3 text-sm shadow-xs transition-[color,box-shadow] focus-visible:ring-3 data-[size=default]:h-9 data-[size=sm]:h-8 data-[size=sm]:text-xs",
          "flex w-full items-center justify-between whitespace-nowrap outline-none",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center",
        )}
      >
        <span data-slot="select-value" data-placeholder={placeholder} className="flex min-w-0 flex-1 text-left">
          {placeholder}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="text-muted-foreground pointer-events-none -mr-0.75 size-4 shrink-0" data-slot="select-icon">
          <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={chevron} />
        </svg>
      </button>
      <div
        hidden
        data-slot="select-content"
        data-size={size}
        data-position="popper"
        data-align="start"
        data-side="bottom"
        data-side-offset={4}
        className="bg-popover text-popover-foreground ring-foreground/10 group/select-content relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg p-1 shadow-md ring-1"
      >
        <div data-slot="select-viewport" data-position="popper" className="max-h-[var(--select-content-available-height,300px)] overflow-x-hidden overflow-y-auto">
          {options.map((o) => (
            <div
              key={o.value}
              role="option"
              tabIndex={o.disabled ? -1 : 0}
              data-slot="select-item"
              data-value={o.value}
              data-disabled={o.disabled ? "" : undefined}
              className="focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground group/item relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            >
              <span data-slot="select-item-text" className="flex flex-1 truncate">{o.label}</span>
              <span className="pointer-events-none absolute right-2 hidden size-4 items-center justify-center group-data-[selected]/item:inline-flex">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="size-4">
                  <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 6L9 17l-5-5" />
                </svg>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
