"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { createClient } from "../lib/supabase/client";
import "./set-password.css";

type PageState = "checking" | "ready" | "missing" | "success";

export default function SetPasswordPage() {
  const [pageState, setPageState] = useState<PageState>("checking");
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;

    try {
      const supabase = createClient();
      const revealForm = () => {
        if (!active) return;
        window.history.replaceState({}, document.title, "/set-password");
        setPageState("ready");
      };
      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) revealForm();
      });

      void supabase.auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error || !data.session) {
          setPageState("missing");
          return;
        }
        revealForm();
      });

      return () => {
        active = false;
        listener.subscription.unsubscribe();
      };
    } catch {
      setPageState("missing");
    }
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    if (password.length < 12) {
      setStatus("Usa una contraseña de al menos 12 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setStatus("Las contraseñas no coinciden.");
      return;
    }

    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setPageState("missing");
        setStatus("El enlace ya no tiene una sesión válida. Solicita una nueva invitación.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setStatus("No fue posible guardar la contraseña. Intenta otra o solicita una nueva invitación.");
        return;
      }

      await supabase.auth.signOut({ scope: "local" });
      setPageState("success");
    } catch {
      setStatus("No fue posible guardar la contraseña. Inténtalo nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="password-shell">
      <section className="password-card">
        <div className="password-brand"><span>✦</span><b>Fisio<span>EnCasa</span></b></div>
        {pageState === "checking" && <div className="password-state" role="status"><span className="password-spinner" /><h1>Validando tu invitación</h1><p>Estamos preparando tu acceso privado.</p></div>}
        {pageState === "missing" && <div className="password-state"><span className="password-state-icon">⌛</span><p className="password-eyebrow">ENLACE NO DISPONIBLE</p><h1>Necesitas un enlace válido</h1><p>Abre el enlace más reciente que recibiste por correo. Si ya venció, solicita uno nuevo desde la pantalla de acceso.</p><Link className="password-secondary" href="/sign-in">Volver al inicio de sesión</Link></div>}
        {pageState === "ready" && <><p className="password-eyebrow">ACTIVACIÓN DE CUENTA</p><h1>Crea tu contraseña privada</h1><p className="password-copy">Solo tú debes conocerla. Usa al menos 12 caracteres; una frase larga es fácil de recordar y más segura.</p><form onSubmit={submit}><label>Nueva contraseña<input name="password" type="password" autoComplete="new-password" required minLength={12} placeholder="Mínimo 12 caracteres" /></label><label>Repite la contraseña<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} placeholder="Escríbela nuevamente" /></label>{status && <p className="password-error" role="alert">{status}</p>}<button className="password-submit" type="submit" disabled={submitting}>{submitting ? "Guardando…" : "Guardar contraseña"}</button></form><p className="password-help">No incluyas nombres de pacientes ni datos clínicos en tu contraseña.</p></>}
        {pageState === "success" && <div className="password-state"><span className="password-state-icon success">✓</span><p className="password-eyebrow">CUENTA ACTIVADA</p><h1>Tu acceso está listo</h1><p>La contraseña quedó guardada de forma segura. Inicia sesión para entrar a tu espacio privado.</p><Link className="password-submit" href="/sign-in">Ir al inicio de sesión</Link></div>}
      </section>
    </main>
  );
}

