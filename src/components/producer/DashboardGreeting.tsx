"use client";

import { useEffect, useState } from "react";

function greet(d: Date) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// Time-of-day must come from the viewer's clock, not the server's (Vercel runs
// in UTC, so a US morning renders as afternoon). suppressHydrationWarning lets
// the client value replace the SSR one without a mismatch warning.
export function DashboardGreeting({ name }: { name: string }) {
  const [hello, setHello] = useState(() => greet(new Date()));
  useEffect(() => {
    setHello(greet(new Date()));
  }, []);

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1
          suppressHydrationWarning
          className="text-4xl font-semibold tracking-[-0.025em] md:text-6xl"
        >
          {hello}, <span className="italic text-accent">{name}.</span>
        </h1>
      </div>
    </div>
  );
}
