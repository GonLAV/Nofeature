import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth.store';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import IncidentDetail from './pages/Incident/IncidentDetail';
import Analytics from './pages/Analytics/Analytics';
import Runbooks from './pages/Runbooks/Runbooks';
import AuditLog from './pages/Audit/AuditLog';
import Team from './pages/Team/Team';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import StatusPage from './pages/Status/StatusPage';
import Maintenance from './pages/Maintenance/Maintenance';
import Templates from './pages/Templates/Templates';
import Integrations from './pages/Integrations/Integrations';
import Settings from './pages/Settings/Settings';
import OnCall from './pages/OnCall/OnCall';
import Digest from './pages/Digest/Digest';
import Escalations from './pages/Escalations/Escalations';
import SearchPage from './pages/Search/Search';
import Postmortems from './pages/Postmortems/Postmortems';
import Promises from './pages/Promises/Promises';
import Calibration from './pages/Calibration/Calibration';
import Doppelgangers from './pages/Doppelgangers/Doppelgangers';
import FailureDna from './pages/FailureDna/FailureDna';
import Board from './pages/Board/Board';
import Services from './pages/Services/Services';
import Inbox from './pages/Inbox/Inbox';
import StatusEmbed from './pages/Settings/StatusEmbed';
import SharedIncident from './pages/Share/SharedIncident';

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
        <Route path="/status/:slug" element={<StatusPage />} />
        <Route path="/share/:token" element={<SharedIncident />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="incidents/:id" element={<IncidentDetail />} />
          <Route path="runbooks" element={<Runbooks />} />
          <Route path="team" element={<Team />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="maintenance" element={<Maintenance />} />
          <Route path="templates" element={<Templates />} />
          <Route path="integrations" element={<Integrations />} />
          <Route path="oncall" element={<OnCall />} />
          <Route path="escalations" element={<Escalations />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="digest" element={<Digest />} />
          <Route path="postmortems" element={<Postmortems />} />
          <Route path="promises" element={<Promises />} />
          <Route path="calibration" element={<Calibration />} />
          <Route path="doppelgangers" element={<Doppelgangers />} />
          <Route path="dna" element={<FailureDna />} />
          <Route path="board" element={<Board />} />
          <Route path="services" element={<Services />} />
          <Route path="inbox" element={<Inbox />} />
          <Route path="status-embed" element={<StatusEmbed />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
