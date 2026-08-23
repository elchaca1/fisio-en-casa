# FisioEnCasa App

MVP mobile-first para gestionar la operación diaria de fisioterapia domiciliaria.

## Alcance actual

- Acceso privado con Supabase Authentication; no existe registro público desde la app.
- Registro real de pacientes, aislado por cuenta mediante Row Level Security (RLS).
- Dashboard, listado y ficha inicial conectados a datos privados.
- Agenda, sesiones, entrevista guiada, audio, IA y Google Calendar continúan en modo de preparación o demostración: no deben utilizarse aún como historia clínica completa.

## Privacidad y puesta en marcha

1. Ejecuta [`supabase/schema.sql`](./supabase/schema.sql) una vez en el SQL Editor del proyecto Supabase vinculado.
2. En Supabase, crea o invita al primer usuario autorizado desde **Authentication → Users**. No compartas contraseñas en este repositorio.
3. Configura las variables públicas de Supabase en desarrollo a partir de [`.env.example`](./.env.example). En producción, Vercel las aporta mediante la integración.

El esquema no concede lectura ni escritura a usuarios anónimos. Cada persona autenticada solo puede acceder a los pacientes cuyo `owner_id` coincide con su sesión. Los registros no tienen política de eliminación; más adelante se archivarán.

## Desarrollo local

```bash
npm install
npm run dev
```

## Próximas integraciones

Agenda y sesiones reales, evolución clínica, micrófono/transcripción, OpenAI API y Google Calendar.

