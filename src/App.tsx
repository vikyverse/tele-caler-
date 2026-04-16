import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import AuthScreen from './components/AuthScreen';
import Layout from './components/Layout';
import ManagerDashboard from './pages/ManagerDashboard';
import HRDashboard from './pages/HRDashboard';
import TelecallerQueue from './pages/TelecallerQueue';

function PrivateRoute({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'telecaller' ? '/queue' : '/'} />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <AuthScreen />} />
      
      <Route path="/" element={
        <PrivateRoute allowedRoles={['manager', 'hr', 'telecaller']}>
          <Layout />
        </PrivateRoute>
      }>
        <Route index element={
          user?.role === 'telecaller' ? <Navigate to="/queue" /> : <ManagerDashboard />
        } />
        <Route path="team" element={
          <PrivateRoute allowedRoles={['manager', 'hr']}>
            <HRDashboard />
          </PrivateRoute>
        } />
        <Route path="queue" element={
          <PrivateRoute allowedRoles={['manager', 'telecaller']}>
            <TelecallerQueue />
          </PrivateRoute>
        } />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppRoutes />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
