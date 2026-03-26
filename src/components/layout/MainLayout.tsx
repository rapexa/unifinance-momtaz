import { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";

interface MainLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export function MainLayout({ children, title, subtitle }: MainLayoutProps) {
  return (
    <div className="flex min-h-screen w-full overflow-x-hidden">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <AppHeader title={title} subtitle={subtitle} />
        <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
