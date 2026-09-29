import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { LicenseBanner } from "@/components/license/LicenseBanner";

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AppHeader title={title} subtitle={subtitle} />
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-6">
          <LicenseBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
