import type { ReactNode } from "react";
import { BackHomeNav } from "./BackHomeNav";

/**
 * Centered title + Back/Home pair, used at the top of every real producer page
 * reached from a menu tile. Matches the title/nav treatment on the tile menu
 * screens (see MenuScreen.tsx) so the whole flow, menu screen through to the
 * destination page, reads as one consistent pattern.
 *
 * There is deliberately no eyebrow/kicker slot. Pages used to carry a small
 * all-caps label above the title ("Builder", "My Team", "Tracking"); it said
 * nothing the title and the menu you came from didn't already say, so it's
 * gone. Don't add it back.
 *
 * `children` is anything that used to sit next to or below the title
 * (description text, filter pills, action buttons), rendered centered beneath
 * the nav.
 *
 * `backHref` is no longer where Back goes. Back walks browser history now, so
 * it returns wherever the user actually came from. It stays as the fallback
 * for entries with no history to pop (new tab, bookmark, emailed link).
 */
export function PageHeader({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-col items-center text-center">
      <h1 className="text-[clamp(2rem,5vw,3rem)] font-semibold leading-[1.1] tracking-[-0.03em]">
        {title}
      </h1>
      <div className="mt-6">
        <BackHomeNav fallbackHref={backHref} />
      </div>
      {children ? <div className="mt-5 flex w-full flex-col items-center gap-4">{children}</div> : null}
    </div>
  );
}
