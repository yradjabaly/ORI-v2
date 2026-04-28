import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid';

interface AuthContextType {
  user: User | null;
  userData: any | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  isDbReady: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDbReady, setIsDbReady] = useState(false);

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDoc(doc(db, 'system', 'connection_test'));
        setIsDbReady(true);
      } catch (error: any) {
        if (error.message?.includes('the client is offline')) {
          console.error("Please check your Firebase configuration: Client is offline");
        } else {
          // Expected permission denied, meaning we reached the server
          setIsDbReady(true); 
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        // Ensure user document exists and fetch data
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          if (!userDoc.exists()) {
            const initialData = {
              name: currentUser.displayName || 'Élève',
              email: currentUser.email || '',
              class: '',
              track: '',
              swipeProfile: '',
              emotionalState: '',
              createdAt: serverTimestamp()
            };
            await setDoc(userDocRef, initialData);
            setUserData(initialData);
          } else {
            setUserData(userDoc.data());
          }
        } catch (error) {
          console.error("Error creating/fetching user profile:", error);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Error signing in with Google', error);
      throw error;
    }
  };

  const logOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out', error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, signInWithGoogle, logOut, isDbReady }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
