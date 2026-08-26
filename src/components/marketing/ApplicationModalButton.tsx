"use client";

import { useEffect, useRef, useState } from "react";

const ICLOSED_FORM_URL = "https://app.iclosed.io/e/allstar/interview-funnel";

type ApplicationModalButtonProps = {
  className?: string;
  label?: string;
};

export function ApplicationModalButton({
  className = "button button-primary",
  label = "Apply To Join All Star Life Group",
}: ApplicationModalButtonProps = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!isOpen && dialog.open) {
      dialog.close();
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <>
      <button
        className={className}
        onClick={() => setIsOpen(true)}
        ref={triggerRef}
        type="button"
      >
        {label}
      </button>

      <dialog
        aria-labelledby="application-modal-title"
        className="application-modal"
        onCancel={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}
        onClose={() => {
          setIsOpen(false);
          triggerRef.current?.focus();
        }}
        ref={dialogRef}
      >
        <header className="application-modal-header">
          <h2 id="application-modal-title">Apply To Join All Star Life Group</h2>
          <button
            aria-label="Close application form"
            className="application-modal-close"
            onClick={() => setIsOpen(false)}
            type="button"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="application-modal-body">
          {!isLoaded && (
            <div className="application-modal-loading" role="status">
              Loading Application…
            </div>
          )}
          <iframe
            allow="clipboard-write"
            className="application-modal-frame"
            loading="eager"
            onLoad={() => setIsLoaded(true)}
            src={ICLOSED_FORM_URL}
            title="All Star Life Group application form"
          />
        </div>
      </dialog>
    </>
  );
}
