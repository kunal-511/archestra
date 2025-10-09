import { getInteractions } from "@shared/api-client";
import type { Metadata } from "next";
import { Lato } from "next/font/google";
import { ColorModeToggle } from "@/components/color-mode-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ArchestraQueryClientProvider } from "./_parts/query-client-provider";
import { AppSidebar } from "./_parts/sidebar";
import { ThemeProvider } from "./_parts/theme-provider";
import "./globals.css";
import { FirstRequestGate } from "@/components/first-request-gate";
import { Toaster } from "@/components/ui/sonner";
import { FirstRequestProvider } from "@/contexts/first-request-context";

const mainFont = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-saira",
});

export const metadata: Metadata = {
  title: "Archestra.AI",
  description: "Enterprise MCP Platform for AI Agents",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let hasFirstRequest = false;
  try {
    const response = await getInteractions();
    hasFirstRequest = (response.data?.length ?? 0) > 0;
  } catch (error) {
    console.error("Failed to fetch interactions:", error);
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${mainFont.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ArchestraQueryClientProvider>
            <FirstRequestProvider initialValue={hasFirstRequest}>
              <FirstRequestGate>
                <SidebarProvider>
                  <AppSidebar />
                  <main className="h-[100%] w-full overflow-auto">
                    <div className="h-8">
                      <SidebarTrigger className="cursor-pointer" />
                      <div className="absolute top-0 right-0">
                        <ColorModeToggle />
                      </div>
                    </div>
                    {children}
                  </main>
                  <Toaster />
                </SidebarProvider>
              </FirstRequestGate>
            </FirstRequestProvider>
          </ArchestraQueryClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
