import { createContext, useContext, useEffect, useMemo, useState } from "react";
import authService from "../services/authService.js";
import { storageKeys } from "../utils/constants.js";

const AuthContext = createContext(null);

const parseUser = () => {
  try {
    const rawUser = localStorage.getItem(storageKeys.user);
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem(storageKeys.token));
  const [user, setUser] = useState(parseUser);
  const [lorIdentity, setLorIdentityState] = useState(
    localStorage.getItem(storageKeys.lorIdentity) || ""
  );
  const [loading, setLoading] = useState(false);

  const login = async (email, password) => {
    setLoading(true);
    try {
      const payload = await authService.login(email, password);
      localStorage.setItem(storageKeys.token, payload.token);
      localStorage.setItem(storageKeys.user, JSON.stringify(payload.user));
      setToken(payload.token);
      setUser(payload.user);

      if (payload.user?.role === "lor") {
        localStorage.removeItem(storageKeys.lorIdentity);
        setLorIdentityState("");
      } else {
        localStorage.removeItem(storageKeys.lorIdentity);
        setLorIdentityState("");
      }

      return payload.user;
    } finally {
      setLoading(false);
    }
  };

  const setLorIdentity = (value) => {
    const safeValue = String(value || "").trim().toLowerCase();
    if (!safeValue) {
      localStorage.removeItem(storageKeys.lorIdentity);
      setLorIdentityState("");
      return;
    }

    localStorage.setItem(storageKeys.lorIdentity, safeValue);
    setLorIdentityState(safeValue);
  };

  const logout = () => {
    localStorage.removeItem(storageKeys.token);
    localStorage.removeItem(storageKeys.user);
    localStorage.removeItem(storageKeys.lorIdentity);
    setToken(null);
    setUser(null);
    setLorIdentityState("");
  };

  useEffect(() => {
    const handleUnauthorized = () => logout();
    window.addEventListener("auth:unauthorized", handleUnauthorized);

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      role: user?.role || null,
      token,
      lorIdentity,
      loading,
      isAuthenticated: Boolean(token),
      login,
      setLorIdentity,
      logout
    }),
    [user, token, lorIdentity, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
