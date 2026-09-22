import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: 'AIzaSyDXUBNOqqcCLU0hL2nymyFNYJAdYeRdHt0',
  authDomain: 'vast-upi.firebaseapp.com',
  projectId: 'vast-upi',
  storageBucket: 'vast-upi.firebasestorage.app',
  messagingSenderId: '1069876017620',
  appId: '1:1069876017620:web:3d11f1ef44fe19ce757e41',
  measurementId: 'G-GPP1888ECP',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'us-central1');
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;
