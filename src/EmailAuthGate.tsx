// src/EmailAuthGate.tsx
import React, { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";

import { auth } from "./firebase";
import App from "./App";

const EMAIL_STORAGE_KEY = "org-messenger-emailForSignIn";

const EmailAuthGate: React.FC = () => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // слушаем состояние авторизации
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // обработка перехода по magic-link
  useEffect(() => {
    const trySignInWithEmailLink = async () => {
      if (!isSignInWithEmailLink(auth, window.location.href)) return;

      setIsAuthLoading(true);
      setAuthError(null);

      try {
        let storedEmail =
          window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? "";

        if (!storedEmail) {
          storedEmail =
            window
              .prompt("Введите email, на который приходила ссылка для входа")
              ?.trim() ?? "";
        }

        if (!storedEmail) {
          throw new Error("Email не указан");
        }

        await signInWithEmailLink(auth, storedEmail, window.location.href);

        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
        window.history.replaceState(
          {},
          document.title,
          window.location.origin + window.location.pathname
        );
      } catch (err: any) {
        console.error(err);
        setAuthError(
          err?.message ?? "Не удалось войти по ссылке. Попробуйте ещё раз."
        );
      } finally {
        setIsAuthLoading(false);
      }
    };

    void trySignInWithEmailLink();
  }, []);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = email.trim();
    if (!trimmed) {
      setAuthError("Введите email");
      return;
    }

    setAuthError(null);
    setIsSendingLink(true);
    setLinkSent(false);

    try {
      await sendSignInLinkToEmail(auth, trimmed, {
        url: window.location.origin,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_STORAGE_KEY, trimmed);
      setLinkSent(true);
    } catch (err: any) {
      console.error(err);
      setAuthError(
        err?.message ?? "Не удалось отправить письмо. Проверьте email."
      );
    } finally {
      setIsSendingLink(false);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="app-root app-auth-screen">
        <div className="auth-card">
          <div className="auth-title">ORG MESSENGER</div>
          <div className="auth-subtitle">Загрузка пользователя…</div>
        </div>
      </div>
    );
  }

  if (firebaseUser) {
    return <App firebaseUser={firebaseUser} onSignOut={() => signOut(auth)} />;
  }

  return (
    <div className="app-root app-auth-screen">
      <div className="auth-card">
        <div className="auth-title">ORG MESSENGER</div>
        <div className="auth-subtitle">Вход по email</div>

        <form className="auth-form" onSubmit={handleSendLink}>
          <label className="auth-label">
            Email
            <input
              className="auth-input"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {authError && <div className="auth-error">{authError}</div>}
          {linkSent && !authError && (
            <div className="auth-success">
              Ссылка отправлена на {email}. Открой письмо и перейди по ссылке.
            </div>
          )}

          <button
            type="submit"
            className="auth-button"
            disabled={isSendingLink}
          >
            {isSendingLink ? "Отправляем…" : "Отправить ссылку для входа"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default EmailAuthGate;
