"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useChats } from "@/lib/chat.query";

interface FirstRequestContextValue {
  hasReceivedFirstRequest: boolean;
  markFirstRequestReceived: () => void;
}

const FirstRequestContext = createContext<FirstRequestContextValue | undefined>(
  undefined,
);

export function FirstRequestProvider({ children }: { children: ReactNode }) {
  const [hasReceivedFirstRequest, setHasReceivedFirstRequest] = useState(false);

  // Check if there are any chats/interactions already
  const { data: chats = [] } = useChats({ initialData: [] });

  useEffect(() => {

    const hasInteractions = chats.some(
      (chat) => chat.interactions && chat.interactions.length > 0,
    );

    if (hasInteractions && !hasReceivedFirstRequest) {
      setHasReceivedFirstRequest(true);
    }
  }, [chats, hasReceivedFirstRequest]);

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
