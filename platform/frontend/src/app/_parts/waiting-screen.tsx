"use client";

import { Loader2 } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getProxyUrl } from "@/lib/config";

export function WaitingScreen() {
  const [proxyUrl, setProxyUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setProxyUrl(getProxyUrl());
  }, []);

  const handleCopy = async () => {
    if (proxyUrl) {
      await navigator.clipboard.writeText(proxyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCopy();
    }
  };

  return (
    <div className="flex items-center justify-center h-screen w-full bg-background">
      <Card className="w-[450px] border-border shadow-xl">
        <CardContent className="pt-8 pb-8 px-8">
          <div className="flex flex-col items-center text-center space-y-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center">
              <Image
                src="/logo-light-mode.png"
                alt="Archestra Logo"
                width={56}
                height={56}
                className="dark:hidden"
              />
              <Image
                src="/logo-dark-mode.png"
                alt="Archestra Logo"
                width={56}
                height={56}
                className="hidden dark:block"
              />
            </div>

            <div>
              <h1 className="text-2xl font-bold mb-2">Archestra Proxy</h1>
              <p className="text-sm text-muted-foreground">
                Configure your LLM to use this endpoint
              </p>
            </div>

            {proxyUrl && (
              <div className="w-full">
                <button
                  type="button"
                  onClick={handleCopy}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-secondary/50 px-4 py-3 rounded-lg font-mono text-sm cursor-pointer hover:bg-secondary/70 transition-colors border border-border"
                >
                  {proxyUrl}
                </button>
                {copied && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                    Copied to clipboard!
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-col items-center gap-4 pt-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-base font-medium">
                  Waiting for first request
                </span>
              </div>
              <p className="text-sm text-muted-foreground max-w-xs">
                Send a request, invoke an LLM agent, etc.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
