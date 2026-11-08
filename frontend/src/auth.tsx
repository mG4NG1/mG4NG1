import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import Purchases from "react-native-purchases";
import { api, loadToken, setToken, setUnauthorizedHandler, TOKEN_KEY, User } from "@/src/api";
import { rcEnabled } from "@/src/lib/revenuecat";
import { storage } from "@/src/utils/storage";

type AuthState = {
  user: User | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  purchaseIdentityError: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
};

const Ctx = createContext<AuthState | null>(null);
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseIdentityError, setPurchaseIdentityError] = useState<string | null>(null);
  const rcIdentityRef = useRef<string | null>(null);

  const clearSession = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    setUserState(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { void clearSession(); });
    let cancelled = false;
    (async () => {
      const t = await loadToken();
      if (t) {
        try {
          const result = await api<User>("/auth/me");
          if (!cancelled) setUserState(result);
        } catch {
          await clearSession();
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [clearSession]);

  // RevenueCat is bound to the stable server-side account ID, not to a device.
  useEffect(() => {
    if (!rcEnabled) return;
    (async () => {
      try {
        if (user?.user_id && rcIdentityRef.current !== user.user_id) {
          await Purchases.logIn(user.user_id);
          rcIdentityRef.current = user.user_id;
          setPurchaseIdentityError(null);
        } else if (!user?.user_id && rcIdentityRef.current) {
          await Purchases.logOut();
          rcIdentityRef.current = null;
        }
      } catch (e) {
        setPurchaseIdentityError(String(e));
      }
    })();
  }, [user?.user_id]);

  const signIn = useCallback(async () => {
    setError(null);
    setSigningIn(true);
    try {
      if (Platform.OS === "web") {
        throw new Error("Google sign-in is available in the ChopOut Android build. Web sign-in needs separate configuration.");
      }
      if (!GOOGLE_WEB_CLIENT_ID) {
        throw new Error("Google sign-in isn't configured yet. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.");
      }
      // Native Google Sign-In requires an Expo development/production build,
      // not Expo Go. No Emergent authentication or API key is involved.
      const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      await GoogleSignin.signIn();
      const { idToken } = await GoogleSignin.getTokens();
      if (!idToken) throw new Error("Google did not provide a sign-in token");
      const res = await api<{ session_token: string; user: User }>("/auth/google", {
        method: "POST",
        body: { id_token: idToken },
      });
      await storage.secureSet(TOKEN_KEY, res.session_token);
      setToken(res.session_token);
      setUserState(res.user);
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch {}
    await clearSession();
    if (Platform.OS !== "web") {
      try {
        const { GoogleSignin } = await import("@react-native-google-signin/google-signin");
        await GoogleSignin.signOut();
      } catch {}
    }
  }, [clearSession]);

  return (
    <Ctx.Provider value={{ user, loading, signingIn, error, purchaseIdentityError, signIn, signOut, setUser: setUserState }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
