"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, createImplicitClient } from "../lib/supabase/client";
import "./sign-in.css";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"sign-in" | "reset">("sign-in");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [statusKind, setStatusKind] = useState<"error" | "success">("error");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    try {
      const linkStatus = new URLSearchParams(window.location.search).get("link");
      if (linkStatus === "invalid") {
        setMode("reset");
        setStatusKind("error");
        setStatus("El enlace ya venció o fue utilizado. Solicita uno nuevo con tu correo autorizado.");
        window.history.replaceState({}, document.title, "/sign-in");
      }
      const authType = new URLSearchParams(window.location.hash.slice(1)).get("type");
      const needsPasswordSetup = authType === "invite" || authType === "recovery";
      const supabase = createClient();
      void supabase.auth.getSession().then(({ data }) => {
        if (active && data.session) {
          router.replace(needsPasswordSetup ? "/set-password" : "/");
          router.refresh();
        }
      });
    } catch {
      // The form will show a safe message if the connection is unavailable.
    }
    return () => {
      active = false;
    };
  }, [router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    setStatusKind("error");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: String(form.get("password") ?? ""),
      });
      if (error) {
        setStatus("Revisa tu correo y contraseña, o solicita acceso al administrador.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setStatus("No fue posible iniciar sesión. Inténtalo nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const requestPasswordLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    setStatusKind("error");
    setSubmitting(true);

    try {
      const supabase = createImplicitClient();
      const redirectTo = new URL("/set-password", window.location.origin).toString();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) {
        setStatus("No fue posible enviar el enlace. Si ya lo solicitaste, espera unos minutos e inténtalo nuevamente.");
        return;
      }
      setStatusKind("success");
      setStatus("Si ese correo tiene una cuenta autorizada, recibirás un enlace para crear o restablecer tu contraseña. Revisa también correo no deseado.");
    } catch {
      setStatus("No fue posible enviar el enlace. Inténtalo nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode: "sign-in" | "reset") => {
    setMode(nextMode);
    setStatus("");
    setStatusKind("error");
  };

  return (
    <main className="sign-in-shell">
      <section className="sign-in-card">
        <div className="sign-in-brand"><span>✦</span><b>Fisio<span>EnCasa</span></b></div>
        {mode === "sign-in" ? (
          <>
            <p className="sign-in-eyebrow">ACCESO PRIVADO</p>
            <h1>Ingresa a FisioEnCasa</h1>
            <p className="sign-in-copy">Accede con la cuenta autorizada para tu perfil de fisioterapeuta o paciente.</p>
            <form onSubmit={submit}>
              <label>Correo electrónico<input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" /></label>
              <label>Contraseña<input name="password" type="password" autoComplete="current-password" required minLength={8} placeholder="Tu contraseña" /></label>
              {status && <p className="sign-in-error" role="alert">{status}</p>}
              <button className="sign-in-submit" type="submit" disabled={submitting}>{submitting ? "Ingresando…" : "Ingresar de forma segura"}</button>
            </form>
            <button className="sign-in-link" type="button" disabled={submitting} onClick={() => switchMode("reset")}>Crear o restablecer contraseña</button>
            <p className="sign-in-help">No hay registro público. Solo pueden ingresar cuentas previamente autorizadas.</p>
          </>
        ) : (
          <>
            <p className="sign-in-eyebrow">ACTIVAR O RECUPERAR CUENTA</p>
            <h1>Crea una contraseña nueva</h1>
            <p className="sign-in-copy">Escribe el correo de tu cuenta autorizada y te enviaremos un enlace seguro.</p>
            <form onSubmit={requestPasswordLink}>
              <label>Correo electrónico<input name="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@correo.com" /></label>
              {status && <p className={statusKind === "success" ? "sign-in-success" : "sign-in-error"} role={statusKind === "success" ? "status" : "alert"}>{status}</p>}
              <button className="sign-in-submit" type="submit" disabled={submitting}>{submitting ? "Enviando…" : "Enviar enlace seguro"}</button>
            </form>
            <button className="sign-in-link" type="button" disabled={submitting} onClick={() => switchMode("sign-in")}>Volver a ingresar con contraseña</button>
            <p className="sign-in-help">Por seguridad, el mensaje será el mismo aunque el correo no tenga una cuenta autorizada.</p>
          </>
        )}
      </section>
    </main>
  );
}

