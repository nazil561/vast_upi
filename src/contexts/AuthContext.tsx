import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User as FirebaseUser, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { getUser, createUser as createFirestoreUser, getWallet, initializeDemoWallet, getSecurityPolicy, createSecurityPolicy, getUserByUpiId } from '../lib/firestore';
import { User, Wallet, SecurityPolicy } from '../types';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: User | null;
  wallet: Wallet | null;
  securityPolicy: SecurityPolicy | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string, upiId: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [securityPolicy, setSecurityPolicy] = useState<SecurityPolicy | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUserData = async (uid: string) => {
    try {
      const [profile, walletData, policy] = await Promise.all([
        getUser(uid),
        getWallet(uid),
        getSecurityPolicy(uid),
      ]);

      setUserProfile(profile);
      setWallet(walletData);
      setSecurityPolicy(policy);
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const refreshUserData = async () => {
    if (user) {
      await loadUserData(user.uid);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        await loadUserData(firebaseUser.uid);
      } else {
        setUserProfile(null);
        setWallet(null);
        setSecurityPolicy(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, displayName: string, upiId: string) => {
    // Check if UPI ID already exists
    const existingUser = await getUserByUpiId(upiId);
    if (existingUser) {
      throw new Error('UPI ID already registered. Please choose a different one.');
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;

    // Update display name
    await updateProfile(credential.user, { displayName });

    // Create Firestore documents
    await createFirestoreUser(uid, displayName, upiId, email);
    await initializeDemoWallet(uid, 10000); // ₹10,000 demo balance
    await createSecurityPolicy(uid);
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value: AuthContextType = {
    user,
    userProfile,
    wallet,
    securityPolicy,
    loading,
    signUp,
    signIn,
    logout,
    refreshUserData,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
