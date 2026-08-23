"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";
import "./sign-in.css";

export default function SignInPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
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

  return <main className="sign-in-shell"><section className="sign-in-card"><div className="sign-in-brand"><span>✦</span><b>Fisio<span>EnCasa</span></b></div><p className="sign-in-eyebrow">ACCESO CLÍNICO PRIVADO</p><h1>Ingresa a tu espacio de trabajo</h1><p className="sign-in-copy">Los registros de pacientes se muestran únicamente dentro de tu cuenta autorizada.</p><form onSubmit={submit}><label>Correo profesional<input name="email" type="email" autoComplete="email" required placeholder="tu@correo.com" /></label><label>Contraseña<input name="password" type="password" autoComplete="current-password" required minLength={8} placeholder="Tu contraseña" /></label>{status && <p className="sign-in-error" role="alert">{status}</p>}<button className="sign-in-submit" type="submit" disabled={submitting}>{submitting ? "Ingresando…" : "Ingresar de forma segura"}</button></form><p className="sign-in-help">No hay registro público. Si aún no tienes acceso, créalo desde el panel seguro de administración.</p></section></main>;
}

