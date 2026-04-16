import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from './firebase';

export type UserRole = 'manager' | 'hr' | 'telecaller';

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          setUser(userDoc.data() as AppUser);
        } else {
          // Check if there's a pre-added profile for this email
          const q = query(collection(db, 'users'), where('email', '==', firebaseUser.email));
          const snap = await getDocs(q);
          
          let role: UserRole = 'telecaller';
          const isBootstrapAdmin = firebaseUser.email === 'aravind.aug10@gmail.com';
          if (isBootstrapAdmin) role = 'manager';

          if (!snap.empty) {
            // Found a pre-added profile!
            const preAddedDoc = snap.docs[0];
            const preAddedUser = preAddedDoc.data() as AppUser;
            role = preAddedUser.role;
            
            // Delete the pre-added dummy document
            if (preAddedDoc.id !== firebaseUser.uid) {
              try {
                await deleteDoc(doc(db, 'users', preAddedDoc.id));
              } catch (e) {
                console.error("Failed to delete pre-added profile", e);
              }
            }
          }

          // Create new user profile with the real UID
          const newUser: AppUser = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || 'Unknown User',
            role: role,
            createdAt: new Date().toISOString(),
          };
          await setDoc(userDocRef, newUser);
          setUser(newUser);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
