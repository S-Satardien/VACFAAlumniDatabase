import React, { useContext, useState, useEffect, createContext } from 'react';
import { auth } from '../firebaseConfig'; // Import the auth instance from firebaseConfig
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged 
} from 'firebase/auth'; // Firebase Auth functions

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true); // Tracks if auth state is being loaded

  // Sign up a new user (you might not need this in production if you create users manually)
  function signup(email, password) {
    return createUserWithEmailAndPassword(auth, email, password);
  }

  // Log in an existing user
  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  // Log out the current user
  function logout() {
    return signOut(auth);
  }

  // Subscribe to auth state changes (runs when component mounts)
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setLoading(false); // Auth state has been determined
    });

    return unsubscribe; // Unsubscribe when component unmounts
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children} {/* Render children only after auth state is determined */}
    </AuthContext.Provider>
  );
}