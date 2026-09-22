import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { auth, googleProvider, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  getUser,
  getWallet,
  getSecurityPolicy,
} from '../lib/firestore';
import { User, Wallet, SecurityPolicy } from '../types';

interface AuthContextType {
  user: FirebaseUser | null;
  userProfile: User | null;
  wallet: Wallet | null;
  securityPolicy: SecurityPolicy | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string, upiId: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const buildSafeUpiId = (displayName: string): string => {
  const base = (displayName || 'pactpay')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || 'user'}${suffix}@pactpay`;
};

const ensureUserProfile = async (firebaseUser: FirebaseUser) => {
  const profile = await getUser(firebaseUser.uid);
  if (profile) {
    return profile;
  }

  const displayName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'PactPay User';
  const email = firebaseUser.email || undefined;
  const phone = firebaseUser.phoneNumber || undefined;
  const upiId = buildSafeUpiId(displayName);

  const ensureProfile = httpsCallable(functions, 'ensureProfile');
  await ensureProfile({ displayName, upiId, email, phone });
  return getUser(firebaseUser.uid);
};

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
        try {
          const profile = await ensureUserProfile(firebaseUser);
          setUserProfile(profile);
          await loadUserData(firebaseUser.uid);
        } catch (error) {
          console.error('Failed to initialize user profile:', error);
          setUserProfile(null);
          setWallet(null);
          setSecurityPolicy(null);
        }
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
    const trimmed = upiId.trim();

    const methods = await fetchSignInMethodsForEmail(auth, email);
    if (methods.length > 0 && !methods.includes('password')) {
      throw new Error('This email is already linked to a different sign-in method. Please use the existing account instead.');
    }

    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    await updateProfile(credential.user, { displayName });
    const ensureProfile = httpsCallable(functions, 'ensureProfile');
    await ensureProfile({ displayName, upiId: trimmed, email });
    setUserProfile(await getUser(uid) ?? null);
  };

  const signIn = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
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
    signInWithGoogle,
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
