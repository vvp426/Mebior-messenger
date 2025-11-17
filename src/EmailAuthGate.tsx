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
import "./index.css";

type EmailAuthGateProps = {
  // Рендер-функция: что рисовать, когда пользователь уже авторизован
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

  // ---- Подписка на состояние авторизации ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // ---- Обработка возврата по email-ссылке ----
  useEffect(() => {
    // Только в браузере
    if (typeof window === "undefined") return;

    const url = window.location.href;
    if (!isSignInWithEmailLink(auth, url)) return;

    setIsAuthLoading(true);

    let storedEmail = window.localStorage.getItem(EMAIL_STORAGE_KEY);

    const completeSignIn = async (finalEmail: string) => {
      try {
        await signInWithEmailLink(auth, finalEmail, url);
        window.localStorage.removeItem(EMAIL_STORAGE_KEY);
      } catch (err) {
        console.error("Ошибка входа по ссылке", err);
        setAuthError("Не удалось завершить вход по ссылке");
      } finally {
        setIsAuthLoading(false);
      }
    };

    if (storedEmail) {
      // Email уже есть в localStorage
      completeSignIn(storedEmail);
    } else {
      // Firebase требует email, если его нет в хранилище
      const promptEmail = window.prompt(
        "Введите email, на который пришла ссылка для входа"
      );
      if (promptEmail) {
        window.localStorage.setItem(EMAIL_STORAGE_KEY, promptEmail);
        completeSignIn(promptEmail);
      } else {
        setIsAuthLoading(false);
      }
    }
  }, []);

  // ---- Отправка письма с magic-ссылкой ----
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
        url: window.location.origin, // вернёт на тот же домен
        handleCodeInApp: true,
      };

      await sendSignInLinkToEmail(auth, trimmed, actionCodeSettings);

      window.localStorage.setItem(EMAIL_STORAGE_KEY, trimmed);
      setLinkSent(true);
    } catch (err: any) {
      console.error("Ошибка отправки ссылки", err);
      setAuthError("Не удалось отправить письмо. Проверьте email.");
    } finally {
      setIsSendingLink(false);
    }
  };

  const handleSignOutClick = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Ошибка выхода", err);
    }
  };

  // ---- Состояние: авторизация ещё грузится ----
  if (isAuthLoading) {
    return (
      <div className="app-root">
        <div className="auth-card">
          <h1 className="auth-title">ORG MESSENGER</h1>
          <div className="loading-text">Проверяем вход…</div>
        </div>
      </div>
    );
  }

  // ---- Состояние: пользователь не авторизован ----
  if (!user) {
    return (
      <div className="app-root">
        <div className="auth-card">
          <h1 className="auth-title">ORG MESSENGER</h1>
          {!linkSent ? (
            <>
              <p className="auth-subtitle">
                Введите корпоративный email, мы отправим ссылку для входа.
              </p>
              <form onSubmit={handleSendLink} className="auth-form">
                <input
                  type="email"
                  className="auth-input"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {authError && (
                  <div className="auth-error">
                    {authError}
                  </div>
                )}
                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSendingLink}
                >
                  {isSendingLink ? "Отправляем…" : "Отправить ссылку"}
                </button>
              </form>
            </>
          ) : (
            <>
              <p className="auth-subtitle">
                Письмо отправлено на <b>{email}</b>.
              </p>
              <p className="auth-subtitle">
                Открой почту на этом или другом устройстве и перейди по ссылке
                из письма, чтобы войти.
              </p>
              <button
                className="secondary-button"
                onClick={() => {
                  setLinkSent(false);
                  setEmail("");
                  setAuthError(null);
                }}
              >
                Ввести другой email
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- Состояние: пользователь авторизован ----
  return (
    <>
      {/* Можно повесить глобальную кнопку Выход где-нибудь сверху, если захочешь */}
      {children(user)}
      {/* если нужно, сюда можно добавить глобальный Toast, уведомления и т.п. */}
    </>
  );
};

export default EmailAuthGate;
