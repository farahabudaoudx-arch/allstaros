/** Stable user-facing copy for failed producer activity loads. Safe for client imports. */
export const PRODUCER_LOAD_ERROR_COPY =
  "We couldn't load your activity right now. Please try again.";

/** Stable user-facing copy for unexpected producer page / segment render failures. */
export const PRODUCER_PAGE_ERROR_COPY =
  "Something went wrong on this page. Please try again.";

/** Generic producer API 500 copy (tracker, profile, settings). Safe for clients. */
export const PRODUCER_API_ERROR_COPY = "Something went wrong. Please try again.";

/** Tracker counter save failures — used by DialTracker debounced POST. */
export const TRACKER_SAVE_ERROR_COPY = "We couldn't save your tracker update. Please try again.";
