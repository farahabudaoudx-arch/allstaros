"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type SettingsHubSection = {
  key: string;
  title: string;
  description: string;
  icon: ReactNode;
  content: ReactNode;
};

function HubInner({ sections }: { sections: SettingsHubSection[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const param = searchParams.get("section");
  const active = sections.find((s) => s.key === param) ?? null;

  const open = (key: string) => {
    router.replace(`${pathname}?section=${key}`, { scroll: false });
    window.scrollTo(0, 0);
  };

  const close = () => {
    router.replace(pathname, { scroll: false });
    window.scrollTo(0, 0);
  };

  if (active) {
    return (
      <div className="mt-8">
        <button
          type="button"
          onClick={close}
          className="rounded-full border border-hairline px-4 py-2 text-sm font-semibold text-ink transition hover:border-mute"
        >
          &larr; All settings
        </button>
        <h2 className="mt-8 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
          {active.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-subtle">{active.description}</p>
        {active.content}
      </div>
    );
  }

  return (
    <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
      {sections.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => open(s.key)}
          className="rounded-2xl border border-hairline bg-card p-5 text-left transition hover:border-mute"
        >
          {s.icon}
          <span className="mt-3 block text-sm font-semibold text-ink md:text-base">
            {s.title}
          </span>
          <span className="mt-1 block text-xs text-subtle">{s.description}</span>
        </button>
      ))}
    </div>
  );
}

export function SettingsHub({ sections }: { sections: SettingsHubSection[] }) {
  return (
    <Suspense fallback={<div className="mt-8" />}>
      <HubInner sections={sections} />
    </Suspense>
  );
}
