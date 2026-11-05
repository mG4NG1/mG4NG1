import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import Purchases from "react-native-purchases";

import { api, loadToken, setToken, setUnauthorizedHandler, TOKEN_KEY, User } from "@/src/api";
import { rcEnabled } from "@/src/lib/revenuecat";
import { storage } from "@/src/utils/storage";

WebBrowser.maybeCompleteAuthSession();

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
const AUTH_URL = "https://auth.emergentagent.com/?redirect=";

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseIdentityError, setPurchaseIdentityError] = useState<string | null>(null);
  const sent = useRef(new Set<string>());
  const rcIdentityRef = useRef<string | null>(null);

  const clearSession = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    setToken(null);
    setUserState(null);
  }, []);

  const exchange = useCallback(async (sessionId: string) => {
    if (sent.current.has(sessionId)) return false;
    sent.current.add(sessionId);
    try {
      const res = await api<{ session_token: string; user: User }>("/auth/session", {
        method: "POST",
        body: { session_id: sessionId },
      });
      await storage.secureSet(TOKEN_KEY, res.session_token);
      setToken(res.session_token);
      setUserState(res.user);
      setError(null);
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed");
      return false;
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
    let sub: { remove: () => void } | undefined;
    (async () => {
      // 1. Process session_id from redirect first
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const sid = extractSessionId(window.location.href);
        if (sid) {
          const ok = await exchange(sid);
          if (ok) {
            const url = new URL(window.location.href);
            url.searchParams.delete("session_id");
            const hash = url.hash.replace(/^#/, "").split("&").filter((p) => !p.startsWith("session_id=")).join("&");
            url.hash = hash ? `#${hash}` : "";
            window.history.replaceState(window.history.state, "", url.toString());
            setLoading(false);
            return;
          }
        }
      } else {
        const initial = extractSessionId(await Linking.getInitialURL());
        if (initial && (await exchange(initial))) {
          setLoading(false);
          return;
        }
        sub = Linking.addEventListener("url", ({ url }) => {
          const sid = extractSessionId(url);
          if (sid) exchange(sid);
        });
      }
      // 2. Existing session
      const t = await loadToken();
      if (t) {
        try {
          setUserState(await api<User>("/auth/me"));
        } catch {
          await clearSession();
        }
      }
      setLoading(false);
    })();
    return () => sub?.remove();
  }, [exchange, clearSession]);

  // Bind RevenueCat identity to our stable user id on every auth path
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
    if (Platform.OS === "web") {
      const redirect = window.location.origin + "/";
      window.location.href = AUTH_URL + encodeURIComponent(redirect);
      return;
    }
    setSigningIn(true);
    const redirect = Linking.createURL("");
    let captured: string | null = null;
    const listener = Linking.addEventListener("url", ({ url }) => {
      captured = url;
    });
    try {
      const result = await WebBrowser.openAuthSessionAsync(AUTH_URL + encodeURIComponent(redirect), redirect);
      const url = (result.type === "success" ? result.url : null) ?? captured ?? (await Linking.getInitialURL());
      const sid = extractSessionId(url);
      if (sid) await exchange(sid);
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed");
    } finally {
      listener.remove();
      setSigningIn(false);
    }
  }, [exchange]);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clearSession();
  }, [clearSession]);

  return (
    <Ctx.Provider
      value={{ user, loading, signingIn, error, purchaseIdentityError, signIn, signOut, setUser: setUserState }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be inside AuthProvider");
  return c;
}
