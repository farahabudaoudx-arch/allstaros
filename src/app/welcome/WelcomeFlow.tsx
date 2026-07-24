"use client";

import { useState } from "react";
import Image from "next/image";
import { SetupForm } from "./SetupForm";
import { HeadshotUpload } from "@/components/producer/HeadshotUpload";

/**
 * The invited-account setup flow. Step one collects name/phone/state/password
 * (SetupForm). For licensed invitees (producers/builders), step two is a
 * REQUIRED headshot — no skip — before they enter the app; their photo saves as
 * 'pending' and the login gate is satisfied. Unlicensed recruits never see the
 * headshot step and go straight in.
 */
export function WelcomeFlow({
  licensed,
  inviterName,
  email,
}: {
  licensed: boolean;
  inviterName: string;
  email: string;
}) {
  const [step, setStep] = useState<"setup" | "photo">("setup");
  const [next, setNext] = useState("/producer");
  const [name, setName] = useState("");

  if (step === "photo") {
    return (
      <div className="w-full max-w-2xl">
        <HeadshotUpload
          heading="Add your headshot"
          currentName={name || "New member"}
          currentPhotoUrl={null}
          onUploaded={() => {
            window.location.href = next;
          }}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-hairline bg-card p-10">
      <div className="mb-8 text-center">
        <Image
          src="/logo.png"
          alt="All Star OS"
          width={140}
          height={79}
          priority
          className="mx-auto h-10 w-auto"
        />
        <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em]">
          Set up your account
        </h1>
        {inviterName ? (
          <p className="mt-3 text-sm text-subtle">
            You were invited by{" "}
            <span className="font-medium text-ink">{inviterName}</span>.
          </p>
        ) : null}
        {email ? (
          <p className="mt-1 text-sm text-subtle">
            Your account will be under{" "}
            <span className="font-medium text-ink">{email}</span>.
          </p>
        ) : null}
      </div>

      <SetupForm
        licensed={licensed}
        onDone={(nextPath, displayName) => {
          if (licensed) {
            setNext(nextPath);
            setName(displayName);
            setStep("photo");
          } else {
            window.location.href = nextPath;
          }
        }}
      />
    </div>
  );
}
