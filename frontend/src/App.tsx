import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppLayout } from './components/AppLayout';
import { AnalyticsProvider } from './components/AnalyticsProvider';
import { DashboardPage } from './pages/DashboardPage';
import { PedidosPage } from './pages/PedidosPage';
import { ProdutosPage } from './pages/ProdutosPage';
import { AnunciosPage } from './pages/AnunciosPage';
import { OtimizacaoPage } from './pages/OtimizacaoPage';
import { ConfigPage } from './pages/ConfigPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <AnalyticsProvider />
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/pedidos" element={<PedidosPage />} />
          <Route path="/produtos" element={<ProdutosPage />} />
          <Route path="/anuncios" element={<AnunciosPage />} />
          <Route path="/otimizacao" element={<OtimizacaoPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
