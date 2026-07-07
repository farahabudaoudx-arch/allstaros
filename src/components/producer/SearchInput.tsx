"use client";

// The standard people-search bar (matches the Recruiting Pipeline's inline
// search). Controlled input; filtering stays in the caller.
export function SearchInput({
  value,
  onChange,
  placeholder = "Search by name…",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-0 ${className}`}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3-3" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-full border border-hairline bg-card py-2 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-mute focus:border-mute"
      />
    </div>
  );
}
