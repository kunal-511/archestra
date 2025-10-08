"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useFirstRequest } from "@/contexts/first-request-context";
import { ProxyInfoModal } from "./proxy-info-modal";

interface FirstRequestGateProps {
  children: ReactNode;
}

export function FirstRequestGate({ children }: FirstRequestGateProps) {
  const { hasReceivedFirstRequest } = useFirstRequest();
  const [isUnlocking, setIsUnlocking] = useState(false);

  useEffect(() => {
    if (hasReceivedFirstRequest && !isUnlocking) {
      setIsUnlocking(true);
    }
  }, [hasReceivedFirstRequest, isUnlocking]);

  return (
    <div className="relative w-full h-full">
      {/* Main content with conditional blur */}
      <div
        className={`w-full h-full transition-all duration-700 ${
          !hasReceivedFirstRequest
            ? "blur-sm pointer-events-none select-none"
            : isUnlocking
              ? "blur-0 pointer-events-auto"
              : ""
        }`}
      >
        {children}
      </div>

      {/* Overlay and modal */}
      {!hasReceivedFirstRequest && (
        <>
          <div
            className={`fixed inset-0 bg-background/40 backdrop-blur-sm z-40 transition-opacity duration-700 ${
              isUnlocking ? "opacity-0" : "opacity-100"
            }`}
          />

          {/* Proxy info modal */}
          <div
            className={`transition-opacity duration-700 ${
              isUnlocking ? "opacity-0" : "opacity-100"
            }`}
          >
            <ProxyInfoModal />
          </div>
        </>
      )}
    </div>
  );
}
