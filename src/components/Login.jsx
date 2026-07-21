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

    const emailVal = emailRef.current.value.trim();
    const passVal = passwordRef.current.value;

    try {
      // 1. Try exact email and password as entered
      await login(emailVal, passVal);
    } catch (err1) {
      try {
        // 2. Fallback: if password verification failed because they typed capital letters in password, try lowercase password
        if (passVal !== passVal.toLowerCase()) {
          await login(emailVal, passVal.toLowerCase());
          return;
        }
        throw err1;
      } catch (err2) {
        try {
          // 3. Fallback: if account was auto-created with cleanEmail (lowercase email) as password, try lowercase email address
          const lowerEmail = emailVal.toLowerCase();
          if (passVal !== lowerEmail) {
            await login(emailVal, lowerEmail);
            return;
          }
          throw err2;
        } catch (err3) {
          console.error("Failed to log in:", err1);
          setError('Failed to log in. Please check your email and password.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="alumni-form-card">
        <h2>Alumni & Screener Login</h2>
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