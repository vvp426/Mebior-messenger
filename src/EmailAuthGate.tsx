import React, { useEffect, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { auth } from "./firebase";
import "./index.css";

type EmailAuthGateProps = {
  // Функция-рендер: что рисовать, когда пользователь уже авторизован
  children: (user: FirebaseUser) => React.ReactNode;
};

const EMAIL_STORAGE_KEY = "org-messenger-emailForSignIn";

const EmailAuthGate: React.FC<EmailAuthGateProps> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  // --- Подписка на состояние авторизации ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // --- Обработка "магической" ссылки из письма ---
  useEffect(() => {
    const url = window.location.href;
    if (!isSignInWithEmailLink(auth, url)) {
      return;
    }

    setIsAuthLoading(true);

    let storedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY) || "";

    if (!storedEmail) {
      storedEmail = window.prompt("Введите email для входа") || "";
    }

    if (!storedEmail) {
      setAuthError("Не указан email для входа.");
      setIsAuthLoading(false);
      return;
    }

    signInWithEmailLink(auth, storedEmail, url)
      .then(() => {
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
        setAuthError(null);
      })
      .catch((err) => {
        console.error("Error signInWithEmailLink", err);
        setAuthError("Не удалось войти по ссылке. Попробуйте ещё раз.");
      })
      .finally(() => {
        setIsAuthLoading(false);
      });
  }, []);

  // --- Отправка письма с ссылкой для входа ---
  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setAuthError("Введите email");
      return;
    }

    try {
      setIsSendingLink(true);

      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, trimmed, actionCodeSettings);
      window.localStorage.setItem(EMAIL_STORAGE_KEY, trimmed);

      setLinkSent(true);
    } catch (err) {
      console.error("Error sendSignInLinkToEmail", err);
      setAuthError("Не удалось отправить письмо. Проверьте email.");
    } finally {
      setIsSendingLink(false);
    }
  };

  // --- Рендер состояний ---

  // 1) Пока не знаем, авторизован ли пользователь
  if (isAuthLoading) {
    return (
      <div className="app-root">
        <div className="auth-card">
          <h1 className="auth-title">ORG MESSENGER</h1>
          <div className="loading-text">Проверяем авторизацию…</div>
        </div>
      </div>
    );
  }

  // 2) Пользователь уже авторизован — рисуем основное приложение
  if (user) {
    return <>{children(user)}</>;
  }

  // 3) Не авторизован — рисуем форму входа по почте
  return (
    <div className="app-root">
      <div className="auth-card">
        <h1 className="auth-title">ORG MESSENGER</h1>

        <div className="auth-tabs">
          <button className="auth-tab active">Вход по email</button>
        </div>

        <form className="auth-form" onSubmit={handleSendLink}>
          <label className="auth-label">Email</label>
          <input
            className="auth-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />

          {authError && <div className="auth-error">{authError}</div>}
          {linkSent && !authError && (
            <div className="auth-success">
              Письмо с ссылкой для входа отправлено на {email}.
              Откройте его и перейдите по ссылке.
            </div>
          )}

          <button
            type="submit"
            className="primary-button"
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
