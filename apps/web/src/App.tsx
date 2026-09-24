import { Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailPage } from './pages/CustomerDetailPage';
import { WarehousesPage } from './pages/WarehousesPage';
import { ReceiptListPage } from './pages/ReceiptListPage';
import { ReceiptStartPage } from './pages/ReceiptStartPage';
import { ReceiptCountPage } from './pages/ReceiptCountPage';
import { StockPage } from './pages/StockPage';
import { DispatchListPage } from './pages/DispatchListPage';
import { DispatchCreatePage } from './pages/DispatchCreatePage';
import { DispatchDetailPage } from './pages/DispatchDetailPage';
import { ChangePasswordPage } from './pages/ChangePasswordPage';
import { UsersPage } from './pages/UsersPage';
import { VehiclesPage } from './pages/VehiclesPage';
import { WaybillSeriesPage } from './pages/WaybillSeriesPage';
import { SettingsPage } from './pages/SettingsPage';
import { UserRole } from '@lojistik/shared';
import { ComingSoonPage } from './pages/ComingSoonPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="/mal-kabul" element={<ReceiptListPage />} />
          <Route path="/mal-kabul/baslat" element={<ReceiptStartPage />} />
          <Route path="/mal-kabul/:id" element={<ReceiptCountPage />} />
          <Route path="/depo" element={<StockPage />} />
          <Route path="/sevkiyat" element={<DispatchListPage />} />
          <Route path="/sevkiyat/yeni" element={<DispatchCreatePage />} />
          <Route path="/sevkiyat/:id" element={<DispatchDetailPage />} />
          <Route path="/musteriler" element={<CustomersPage />} />
          <Route path="/musteriler/:id" element={<CustomerDetailPage />} />
          <Route path="/sifre-degistir" element={<ChangePasswordPage />} />
          <Route element={<ProtectedRoute roles={[UserRole.ADMIN]} />}>
            <Route path="/kullanicilar" element={<UsersPage />} />
          </Route>
          <Route path="/depolar" element={<WarehousesPage />} />
          <Route path="/araclar" element={<VehiclesPage />} />
          <Route path="/ayarlar" element={<SettingsPage />} />
          <Route path="/irsaliye-serisi" element={<WaybillSeriesPage />} />
        </Route>
      </Route>
      <Route path="*" element={<ComingSoonPage title="Sayfa bulunamadı" />} />
    </Routes>
  );
}
