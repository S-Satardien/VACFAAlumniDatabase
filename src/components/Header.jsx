import React from 'react';
import '../App.css'; 

// NEW: Accept onLogout prop
function Header({ searchTerm, setSearchTerm, onLogout }) { 
  return (
    <header className="header-container">
      <div className="header-content">
        <div className="logo-placeholder">
          <img src="/path/to/your/logo.png" alt="Company Logo" className="logo-image" />
        </div>
        <h1 className="header-title">Alumni Directory</h1>
        
        <div className="header-actions"> {/* NEW: Wrapper for search and logout */}
            {/* Search bar with integrated icon */}
            <div className="header-search-bar"> 
            <div className="search-input-wrapper"> 
                <input
                type="text"
                placeholder="Search by name, country, year, or keywords..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                />
                <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
            </div>
            </div>
            {/* NEW: Logout Button */}
            {onLogout && (
                <button onClick={onLogout} className="logout-button">
                Logout
                </button>
            )}
        </div>
      </div>
    </header>
  );
}

export default Header;