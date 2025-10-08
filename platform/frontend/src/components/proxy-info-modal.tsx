"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PROXY_URL = "http://localhost:9000/v1";

export function ProxyInfoModal() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === "...") return "";
        return `${prev}.`;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <Card className="shadow-2xl bg-background/95 backdrop-blur-md border-2 w-full max-w-2xl animate-in fade-in-0 zoom-in-95 duration-500">
        <CardHeader className="flex flex-row gap-4 px-6 items-center">
          <div className="rounded-full w-20 h-20 shrink-0 overflow-hidden ring-4 ring-primary/20 ring-offset-2 ring-offset-background">
            <Image
              src="/link-icon.jpg"
              alt="Proxy URL"
              width={120}
              height={120}
              className="object-cover"
            />
          </div>
          <div>
            <CardTitle className="text-3xl font-bold">
              Archestra Proxy
            </CardTitle>
            <CardDescription className="text-base mt-1">
              Configure your LLM to use this endpoint
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-6 space-y-6">
          <Card className="bg-muted/50 border-primary/20">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <code className="text-lg font-mono font-semibold text-primary">
                  {PROXY_URL}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(PROXY_URL);
                    toast.success("Proxy URL copied to clipboard");
                  }}
                  className="ml-4 px-3 py-1 text-xs font-medium rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-all hover:scale-105 active:scale-95"
                >
                  Copy
                </button>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-center py-8">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-b-primary/50 rounded-full animate-spin animation-delay-150" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-muted-foreground">
                  Waiting for first request{dots}
                </p>
                <p className="text-sm text-muted-foreground/70 mt-2">
                  Send a request from your LLM to get started
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground text-center">
              The UI will unlock automatically once the first request is
              received
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
