import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Users from "./pages/Users";
import Students from "./pages/Students";
import Plans from "./pages/Plans";
import Payments from "./pages/Payments";
import Payroll from "./pages/Payroll";
import Reminders from "./pages/Reminders";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import PayPage from "./pages/PayPage";
import PaymentResult from "./pages/PaymentResult";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Index />} />
          <Route path="/users" element={<Users />} />
          <Route path="/students" element={<Students />} />
          <Route path="/plans" element={<Plans />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/reminders" element={<Reminders />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          {/* Public payment pages – no auth required */}
          <Route path="/pay/:id" element={<PayPage />} />
          <Route path="/paymentResult/:id" element={<PaymentResult />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
