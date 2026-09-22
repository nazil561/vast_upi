import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: "AIzaSyDXUBNOqqcCLU0hL2nymyFNYJAdYeRdHt0",
  authDomain: "vast-upi.firebaseapp.com",
  projectId: "vast-upi",
  storageBucket: "vast-upi.firebasestorage.app",
  messagingSenderId: "1069876017620",
  appId: "1:1069876017620:web:3d11f1ef44fe19ce757e41",
  measurementId: "G-GPP1888ECP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export default app;
