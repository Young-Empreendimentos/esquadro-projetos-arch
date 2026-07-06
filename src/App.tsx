import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import PautaGeral from "@/pages/PautaGeral";
import Comentarios from "@/pages/Comentarios";
import Historico from "@/pages/Historico";
import RegistroHoras from "@/pages/RegistroHoras";
import RelatorioHoras from "@/pages/RelatorioHoras";
import CustosIncorridos from "@/pages/CustosIncorridos";
import Configuracoes from "@/pages/Configuracoes";
import PendenciasHoras from "@/pages/PendenciasHoras";
import Impugnacoes from "@/pages/Impugnacoes";
import PendenciasModal from "@/components/PendenciasModal";
import AcessoPendente from "@/components/AcessoPendente";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  // Logado mas sem perfil ativo (2ª validação por sistema) → aguardando liberação.
  if (!profile) return <AcessoPendente />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading } = useAuth();

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <PendenciasModal />
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pauta" element={<PautaGeral />} />
              <Route path="/comentarios" element={<Comentarios />} />
              <Route path="/historico" element={<Historico />} />
              <Route path="/horas" element={<RegistroHoras />} />
              <Route path="/relatorio-horas" element={<RelatorioHoras />} />
              <Route path="/pendencias-horas" element={<PendenciasHoras />} />
              <Route path="/impugnacoes" element={<Impugnacoes />} />
              <Route path="/custos" element={<AdminRoute><CustosIncorridos /></AdminRoute>} />
              <Route path="/configuracoes" element={<AdminRoute><Configuracoes /></AdminRoute>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
