// Import the functions you need from the SDKs you need
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth"; // NEW: Import getAuth
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB83jFN9Ng5-OTyRhWmIRtfNuLZcqLYcp0",
  authDomain: "vacfa-database.firebaseapp.com",
  projectId: "vacfa-database",
  storageBucket: "vacfa-database.firebasestorage.app",
  messagingSenderId: "248325705470",
  appId: "1:248325705470:web:08616125e80e3b57111faf",
  measurementId: "G-0J8XNW80BM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

// NEW: Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app); 

// Export both db and auth for use in other components
export { db, auth }; 