/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AuthGuard from './components/AuthGuard';
import { AuthProvider } from './contexts/AuthContext';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import Checklist from './pages/Checklist';
import Share from './pages/Share';
import Login from './pages/Login';
import Profile from './pages/Profile';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/share/:userId" element={<Share />} />
          <Route element={<AuthGuard />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<Navigate to="/chat" replace />} />
              <Route path="chat" element={<Chat />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="checklist" element={<Checklist />} />
              <Route path="profile" element={<Profile />} />
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
