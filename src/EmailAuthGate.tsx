// src/EmailAuthGate.tsx

import React, { useEffect, useState } from "react";
import {
  getAuth,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import "./index.css";

const auth = getAuth();

type EmailAuthGateProps = {
  children: (user: FirebaseUser) => React.ReactNode;
};

const EMAIL_STORAGE_KEY = "org-messenger-signin-email";

const EmailAuthGate: React.FC<EmailAuthGateProps> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [isSendingLink, setIsSendingLink] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Подписка на состояние авторизации
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsLoading(false);
    });
    return unsub;
  }, []);

  // Проверка входа по ссылке (когда пользователь кликнул по письму)
  useEffect(() => {
    const tryFinishEmailLinkSignIn = async () => {
      const url = window.location.href;
      if (!isSignInWithEmailLink(auth, url)) return;

      setIsLoading(true);
      setAuthError(null);

      let storedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY);

      if (!storedEmail) {
        // Если почты нет в storage (например, открыли ссылку в другом браузере),
        // просим пользователя ввести её ещё раз.
        const promptEmail = window.prompt(
          "Введите email, на который была отправлена ссылка для входа:"
        );
        if (!promptEmail) {
          setIsLoading(false);
          return;
        }
        storedEmail = promptEmail;
      }

      try {
        await signInWithEmailLink(auth, storedEmail, url);
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
      } catch (err: any) {
        console.error(err);
        setAuthError("Не удалось завершить вход по ссылке.");
      } finally {
        setIsLoading(false);
      }
    };

    void tryFinishEmailLinkSignIn();
  }, []);

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSendingLink(true);
    setAuthError(null);

    try {
      const actionCodeSettings = {
        // Очень важно: должен совпадать с доменом, который добавлен как authorized в Firebase
        url: window.location.origin,
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem(EMAIL_STORAGE_KEY, email);
      alert("Ссылка для входа отправлена на указанный email.");
    } catch (err: any) {
      console.error(err);
      setAuthError("Не удалось отправить письмо. Проверьте email.");
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (isLoading) {
    return (
      <div className="app-root center-screen">
        <div className="auth-card">
          <h1 className="app-title">ORG MESSENGER</h1>
          <p className="auth-subtitle">Загрузка пользователя…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-root center-screen">
        <div className="auth-card">
          <h1 className="app-title">ORG MESSENGER</h1>
          <p className="auth-subtitle">Вход по email</p>

          <form onSubmit={handleSendLink} className="auth-form">
            <label className="auth-label">
              Email
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </label>

            {authError && <p className="auth-error">{authError}</p>}

            <button
              type="submit"
              className="auth-button"
              disabled={isSendingLink}
            >
              {isSendingLink ? "Отправка…" : "Отправить ссылку для входа"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* На всякий пожарный — маленькая кнопка выхода (можно убрать из UI, если мешает) */}
      {/* <button onClick={handleSignOut}>Выйти</button> */}
      {children(user)}
    </>
  );
};

export default EmailAuthGate;
