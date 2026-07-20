import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isUserAdmin } from '../config/admins';
import './NavigationBar.css';

const NavigationBar = ({ onLogout }) => {
    const { currentUser } = useAuth();

    if (!currentUser) return null;

    const isAdmin = isUserAdmin(currentUser.email);

    return (
        <nav className="navbar-container">
            <div className="navbar-brand">
                <span className="navbar-logo-text">VACFA Alumni & Screening Portal</span>
            </div>
            <div className="navbar-links">
                <NavLink 
                    to="/dashboard" 
                    className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
                >
                    Alumni Directory
                </NavLink>
                <NavLink 
                    to="/screening" 
                    className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
                >
                    Screening Workspace
                </NavLink>
                {isAdmin && (
                    <NavLink 
                        to="/screening/admin" 
                        className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
                    >
                        Screening Admin
                    </NavLink>
                )}
            </div>
            <div className="navbar-user">
                <span className="user-email">{currentUser.email}</span>
                <button onClick={onLogout} className="navbar-logout-btn">
                    Logout
                </button>
            </div>
        </nav>
    );
};

export default NavigationBar;
