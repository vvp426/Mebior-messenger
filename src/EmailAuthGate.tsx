// src/EmailAuthGate.tsx

import React, { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";

import { auth } from "./firebase";
import App from "./App";
import "./index.css";
import "./App.css";

const EMAIL_STORAGE_KEY = "org-messenger-emailForSignIn";

const EmailAuthGate: React.FC = () => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);

  // -------------------------------------------------------------------
  //  Подписка на состояние авторизации
  // -------------------------------------------------------------------
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsAuthLoading(false);
    });

    return () => unsub();
  }, []);

  // -------------------------------------------------------------------
  //  Обработка входа по magic-link (когда пользователь переходит по ссылке)
  // -------------------------------------------------------------------
  useEffect(() => {
    const trySignInWithEmailLink = async () => {
      // если это не email-link для Firebase — выходим
      if (!isSignInWithEmailLink(auth, window.location.href)) {
        return;
      }

      setIsAuthLoading(true);
      setAuthError(null);

      try {
        // email стараемся взять из localStorage, иначе спрашиваем
        let storedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY) ?? "";

        if (!storedEmail) {
          storedEmail = window.prompt(
            "Введите email, на который приходила ссылка для входа"
          )?.trim() ?? "";
        }

        if (!storedEmail) {
          throw new Error("Email не указан.");
        }

        await signInWithEmailLink(auth, storedEmail, window.location.href);

        // чистим URL от query-параметров Firebase
        window.history.replaceState(
          {},
          document.title,
          window.location.origin + window.location.pathname
        );

        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
      } catch (err: any) {
        console.error("Error signInWithEmailLink:", err);
        setAuthError(
          err?.message ?? "Не удалось войти по ссылке. Попробуйте ещё раз."
        );
      } finally {
        setIsAuthLoading(false);
      }
    };

    void trySignInWithEmailLink();
  }, []);

  // -------------------------------------------------------------------
  //  Отправка magic-link на email
  // -------------------------------------------------------------------
  const handleSendLinkClick = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError("Введите email.");
      return;
    }

    setAuthError(null);
    setIsSendingLink(true);
    setLinkSent(false);

    try {
      await sendSignInLinkToEmail(auth, trimmedEmail, {
        url: window.location.origin,
        handleCodeInApp: true,
      });

      window.localStorage.setItem(EMAIL_STORAGE_KEY, trimmedEmail);
      setLinkSent(true);
    } catch (err: any) {
      console.error("Error sendSignInLinkToEmail:", err);
      setAuthError(
        err?.message ?? "Не удалось отправить письмо. Проверьте email."
      );
    } finally {
      setIsSendingLink(false);
    }
  };

  // -------------------------------------------------------------------
  //  Экраны
  // -------------------------------------------------------------------

  // 1. Пока Firebase разбирается, кто мы такие
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

  // 2. Пользователь уже авторизован — даём ему весь мессенджер
  if (firebaseUser) {
    return <App firebaseUser={firebaseUser} />;
  }

  // 3. Экран входа по email-ссылке
  return (
    <div className="app-root app-auth-screen">
      <div className="auth-card">
        <div className="auth-title">ORG MESSENGER</div>
        <div className="auth-subtitle">Вход по email</div>

        <form className="auth-form" onSubmit={handleSendLinkClick}>
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
              Ссылка для входа отправлена на {email}. Откройте письмо и перейдите
              по ссылке.
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
