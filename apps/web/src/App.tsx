import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import IncidentPage from './pages/IncidentPage'
import AnalyticsPage from './pages/AnalyticsPage'
import Layout from './components/Layout'
import PrivateRoute from './components/PrivateRoute'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Layout>
              <DashboardPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/incidents/:id"
        element={
          <PrivateRoute>
            <Layout>
              <IncidentPage />
            </Layout>
          </PrivateRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <PrivateRoute>
            <Layout>
              <AnalyticsPage />
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  )
}
