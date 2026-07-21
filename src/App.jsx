import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import Login from './components/Login';
import NavigationBar from './components/NavigationBar';
import DashboardPage from './components/DashboardPage';
import ScreeningWorkspace from './components/ScreeningWorkspace';
import ScreeningAdmin from './components/ScreeningAdmin';
import { isUserAdmin } from './config/admins';

function AppContent() {
    const { currentUser, logout } = useAuth();

    const handleLogout = async () => {
        try {
            await logout();
        } catch (err) {
            console.error("Failed to log out:", err);
            alert("Failed to log out. Please try again.");
        }
    };

    if (!currentUser) {
        return (
            <div className="App">
                <Login />
            </div>
        );
    }

    const isAdmin = isUserAdmin(currentUser.email);

    return (
        <div className="App">
            <NavigationBar onLogout={handleLogout} />
            <Routes>
                {isAdmin && <Route path="/dashboard" element={<DashboardPage />} />}
                <Route path="/screening" element={<ScreeningWorkspace />} />
                {isAdmin && <Route path="/screening/admin" element={<ScreeningAdmin />} />}
                <Route path="*" element={<Navigate to={isAdmin ? "/dashboard" : "/screening"} replace />} />
            </Routes>
        </div>
    );
}

function AppWithAuth() {
    return (
        <AuthProvider>
            <Router>
                <AppContent />
            </Router>
        </AuthProvider>
    );
}

export default AppWithAuth;