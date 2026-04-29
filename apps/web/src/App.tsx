import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import IncidentDetail from './pages/Incident/IncidentDetail';
import Analytics from './pages/Analytics/Analytics';
import Billing from './pages/Billing/Billing';
import BillingSuccess from './pages/Billing/BillingSuccess';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const token = useAuthStore((s) => s.accessToken);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Billing success/cancel land outside the sidebar layout */}
        <Route path="/billing/success" element={<PrivateRoute><BillingSuccess /></PrivateRoute>} />

        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="billing" element={<Billing />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
