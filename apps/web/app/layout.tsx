import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { TerminalOverlay } from "@/components/ui/TerminalOverlay";
import { ConfirmProvider } from "@/components/ui/ConfirmProvider";
import { AppProvider } from "@/components/app-provider";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "OpenViking 知识管理平台",
  description: "企业级 AI 知识库管理平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${geist.variable} ${geistMono.variable} ${spaceGrotesk.variable} min-h-full bg-[var(--bg-base)] text-[var(--text-primary)] antialiased transition-colors duration-300 vector-space-bg`}>
        <AppProvider>
          <ConfirmProvider>
            {children}
            <TerminalOverlay />
          </ConfirmProvider>
        </AppProvider>
        <Toaster 
          position="bottom-center"
          toastOptions={{
            className: "ov-card !border-[var(--border)] !bg-[var(--bg-card)] !text-[var(--text-primary)] !font-mono !shadow-[var(--shadow-hover)]",
            style: {
              borderWidth: "var(--border-width)",
              borderRadius: "var(--radius-base)",
              boxShadow: "var(--shadow-base)",
              backgroundColor: "var(--bg-card)",
              color: "var(--text-primary)",
              borderStyle: "solid",
              borderColor: "var(--border)"
            }
          }}
        />
      </body>
    </html>
  );
}
