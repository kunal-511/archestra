"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useInteractions } from "@/lib/interaction.query";

interface FirstRequestContextValue {
  hasReceivedFirstRequest: boolean;
  markFirstRequestReceived: () => void;
}

const FirstRequestContext = createContext<FirstRequestContextValue | undefined>(
  undefined,
);

export function FirstRequestProvider({ children }: { children: ReactNode }) {
  const [hasReceivedFirstRequest, setHasReceivedFirstRequest] = useState(false);

  // Check if there are any interactions already
  const { data: interactions = [] } = useInteractions({ initialData: [] });

  useEffect(() => {
    const hasInteractions = interactions && interactions.length > 0;

    if (hasInteractions && !hasReceivedFirstRequest) {
      setHasReceivedFirstRequest(true);
    }
  }, [interactions, hasReceivedFirstRequest]);

  const markFirstRequestReceived = () => {
    setHasReceivedFirstRequest(true);
  };

  return (
    <FirstRequestContext.Provider
      value={{ hasReceivedFirstRequest, markFirstRequestReceived }}
    >
      {children}
    </FirstRequestContext.Provider>
  );
}

export function useFirstRequest() {
  const context = useContext(FirstRequestContext);
  if (context === undefined) {
    throw new Error(
      "useFirstRequest must be used within a FirstRequestProvider",
    );
  }
  return context;
}
