import React, { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext'; // Import useAuth hook
import '../App.css'; // For styling login form

function Login() {
  const emailRef = useRef();
  const passwordRef = useRef();
  const { login } = useAuth(); // Get the login function from AuthContext
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(emailRef.current.value, passwordRef.current.value);
      // If login successful, the onAuthStateChanged in AuthContext will update currentUser
      // which will then render the App component
    } catch (err) {
      console.error("Failed to log in:", err);
      setError('Failed to log in. Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="alumni-form-card"> {/* Re-using form card style */}
        <h2>Alumni Login</h2>
        {error && <p className="form-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email:</label>
            <input type="email" id="email" ref={emailRef} required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password:</label>
            <input type="password" id="password" ref={passwordRef} required />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={loading}>
              {loading ? 'Logging In...' : 'Log In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Login;