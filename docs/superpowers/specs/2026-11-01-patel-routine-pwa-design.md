# Especificación de Diseño: Patel Routine PWA (Seguimiento y Motivación Compartida)

**Fecha:** 2026-11-01  
**Estado:** Borrador para revisión del usuario  
**Plataforma de despliegue:** Render (Web Service gratuito) + Base de datos en la nube (Neon PostgreSQL / Turso) con fallback local automático (SQLite/JSON).

---

## 1. Propósito y Alcance

Construir una Aplicación Web Progresiva (PWA) instalable en móviles (iOS/Android) y escritorio para organizar, reproducir y hacer seguimiento de las rutinas biomecánicas, posturales y miofasciales de Oscar Patel (66 videos organizados en 4 enfoques).

La aplicación está diseñada inicialmente para uso en pareja (el creador y su esposa), pero su arquitectura es **multi-usuario y escalable**, permitiendo:
1. Que familiares, amigos y allegados creen sus propias cuentas y se vinculen mediante **Códigos de Compañero** para compartir su avance y motivarse mutuamente en privado.
2. Que en el futuro pueda ofrecerse como un servicio de suscripción (`plan: 'free' | 'pro'`).

---

## 2. Arquitectura del Sistema

Siguiendo el principio de simplicidad máxima y mantenibilidad (*ponytail*):
- **Servidor Único (Node.js):** Un servidor HTTP/Express ligero (`server.js`) que sirve los activos estáticos de la PWA y expone la API REST bajo `/api/*`. Cero pasos de compilación complejos en el servidor para despliegues instantáneos en Render.
- **Base de Datos Dual (Local + Nube):**
  - En producción (Render): Conecta mediante `DATABASE_URL` a **PostgreSQL (Neon.tech - capa gratuita permanente)**.
  - En desarrollo local sin variables externas: Usa almacenamiento SQLite nativo de Node (`node:sqlite` / archivo local) con la misma interfaz de consultas, para que funcione de inmediato al clonar el repositorio.
- **Catálogo de Contenido (66 Videos):**
  - Precargado en `data/catalog.json` con los 66 videos extraídos del Google Sheet (`1UAVeVGK7lRMrI5H0Aj7MjdEeoOE4R_rJx0ZeSduc4Qw`), organizados en sus 4 enfoques y mapeados al plan progresivo de 3 semanas.
  - Incluye un endpoint de administración (`POST /api/admin/sync-sheet`) que descarga en vivo los CSV de las 4 pestañas del Google Sheet para actualizar títulos, enlaces o nuevos videos sin tocar código.
- **PWA Nativa:**
  - `manifest.json` con íconos, colores pastel/orgánicos y `display: standalone`.
  - `sw.js` (Service Worker) para caché de activos estáticos y recepción de eventos `push` (Notificaciones Web Push nativas con protocolo VAPID).

---

## 3. Modelo de Datos

### 3.1. `users`
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | ` SERIAL / INTEGER PK` | Identificador único del usuario |
| `email` | `TEXT UNIQUE` | Correo o nombre de usuario para iniciar sesión |
| `display_name` | `TEXT` | Nombre visible (ej. "Carlos", "Esposa") |
| `password_hash` | `TEXT` | Hash seguro generado con `crypto.scryptSync` + salt |
| `role` | `TEXT` | `'admin'` (primer usuario registrado) o `'member'` |
| `plan` | `TEXT` | `'free'` o `'pro'` (preparado para monetización futura) |
| `invite_code` | `TEXT UNIQUE` | Código corto único (ej. `PATEL-8F2A`) para vincular compañeros |
| `current_week` | `INTEGER` | Fase activa del usuario: `1` (Semana 1), `2` (Semana 2), `3` (Semana 3+) |
| `reminder_time` | `TEXT` | Hora diaria de recordatorio en formato `HH:MM` (ej. `"08:00"`) |
| `timezone` | `TEXT` | Zona horaria IANA del usuario (ej. `"America/Bogota"`) |
| `created_at` | `TIMESTAMP` | Fecha de registro |

### 3.2. `connections` (Vínculos entre pareja / amigos / familia)
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `SERIAL / INTEGER PK` | Identificador del vínculo |
| `user_id` | `INTEGER FK` | Usuario A |
| `partner_id` | `INTEGER FK` | Usuario B vinculado |
| `created_at` | `TIMESTAMP` | Fecha de vinculación |

*(Nota: Al ingresar el `invite_code` de otra persona, se crea la relación bidireccional para que ambos vean su progreso mutuo en la pestaña Compañeros).*

### 3.3. `video_progress` (Avance del catálogo de 66 videos)
| Campo | Tipo | Descripción |
|---|---|---|
| `user_id` | `INTEGER FK` | Usuario |
| `video_id` | `TEXT` | ID único del video (ej. `e1-p1`, `e3-p14`) |
| `completed_at` | `TIMESTAMP` | Fecha en que se marcó como visto/aprendido |
| `notes` | `TEXT` | Nota personal opcional sobre el ejercicio |

### 3.4. `daily_checkins` (Seguimiento de rutina diaria y rachas)
| Campo | Tipo | Descripción |
|---|---|---|
| `user_id` | `INTEGER FK` | Usuario |
| `date` | `TEXT` | Fecha local `YYYY-MM-DD` |
| `week_phase` | `INTEGER` | Fase (1, 2 o 3) practicada ese día |
| `completed_blocks` | `TEXT (JSON)` | Lista de IDs de videos/bloques practicados ese día |
| `completed` | `BOOLEAN` | `true` cuando cumple el mínimo diario de su semana |
| `updated_at` | `TIMESTAMP` | Última actualización |

### 3.5. `cheers` (Motivación e interacciones entre compañeros)
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `SERIAL / INTEGER PK` | Identificador |
| `from_user_id` | `INTEGER FK` | Quién envía el ánimo |
| `to_user_id` | `INTEGER FK` | Quién lo recibe |
| `message` | `TEXT` | Mensaje motivador o reacción |
| `created_at` | `TIMESTAMP` | Fecha y hora |

### 3.6. `push_subscriptions` (Dispositivos suscritos a notificaciones)
| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `SERIAL / INTEGER PK` | Identificador |
| `user_id` | `INTEGER FK` | Usuario dueño del dispositivo |
| `endpoint` | `TEXT UNIQUE` | URL del servicio Push del navegador/móvil |
| `keys_json` | `TEXT` | Claves `p256dh` y `auth` en JSON |
| `created_at` | `TIMESTAMP` | Fecha de registro |

---

## 4. Plan Progresivo por Semanas y Frases Motivadoras

### 4.1. Estructura de las 3 Fases (Semanas)
El catálogo mapea automáticamente los videos recomendados para cada fase:

1. **Semana 1 — Conciencia y Calma (Base Neurológica y Lingual):**
   - **Mapa General:** Enfoque 4, Posición 6 (*Full 2026 Guide - 45 min*).
   - **Bloque A (Respiración Backbreathing y Regulación Nerviosa):** Enfoque 3, Posiciones 1 a 8.
   - **Bloque B (Postura Lingual y Deglución Correcta):** Enfoque 1, Posiciones 1 a 7.
2. **Semana 2 — Desbloqueo Corporal y Fascial:**
   - Mantiene los hábitos base de la Semana 1.
   - **Bloque C (Liberación Fascial Diaria):** Enfoque 3, Posición 14 (*6 Minute Daily Fascia Routine*).
   - **Bloque D (Corrección de Cuello y Postura de Pies):** Enfoque 2, Posiciones 3 (*Activación del tendón del pie*), 9 (*Forward Head Posture*) y 10 (*Postura por sedentarismo*).
3. **Semana 3 en adelante — Remodelación Activa:**
   - **Aviso de Seguridad:** Verificación explícita de ausencia de dolor/tensión mandibular (ATM) o cervical antes de ejecutar.
   - **Bloque E (Remodelación Miofascial Profunda):** Enfoque 3, Posición 15 (*Masterclass Fasciapulling - 23 min*).
   - **Bloque F (Remodelación Intraoral):** Enfoque 1, Posición 30 (*Thumbpulling 2.0 - 5 Minutes Every Day*).

### 4.2. Motor de Frases Motivadoras Contextualizadas
En lugar de frases genéricas, el banco de frases (`data/quotes.json`) clasifica cada cita por `phase` (1, 2, 3) y `topic` (`nervous_system`, `breathing`, `tongue`, `fascia`, `posture`, `consistency`, `couple`):
- Si el usuario está en la **Semana 1**, ve y recibe en sus notificaciones frases como: *"Somos tan atractivos como lo es nuestro sistema nervioso. Relaja la mandíbula, respira hacia la espalda y deja que tu cuerpo salga del modo alerta."*
- Si está en la **Semana 2**, recibe citas sobre la cadena fascial desde el dedo gordo del pie hasta el cráneo y la liberación de tensión acumulada por estar sentado.
- Si está en la **Semana 3+**, recibe citas sobre plasticidad craneal, constancia a largo plazo y pulsos rítmicos sin tensión.

---

## 5. Diseño de Interfaz (UI/UX) y Componentes

Estética **Pastel Routine**: Tonos cálidos, relajantes y limpios (crema suave, verde salvia, terracota pastel, azul sereno), tipografía legible y tarjetas con bordes redondeados pensadas para reducir el cortisol visual.

### 5.1. Pantalla de Acceso (Login / Registro)
- Formulario limpio con alternancia entre **Iniciar Sesión** y **Crear Cuenta**.
- Sesión persistente mediante cookie HTTP-only firmada / token JWT en `localStorage` para que en el móvil nunca pida contraseña de nuevo tras instalar la PWA.

### 5.2. Pestaña 1: 📅 Hoy (Mi Rutina Diaria)
- **Cabecera:** Saludo personalizado, racha actual (`🔥 X días`), selector rápido de Fase (`Semana 1`, `Semana 2`, `Semana 3+`) y tarjeta con la **Frase Motivadora del Día** (con botón para cambiar de frase o enviársela a tu pareja).
- **Mini-Resumen de tu Pareja/Compañero:** Banda superior que muestra: *"💚 [Nombre] ya completó su rutina de hoy"* o *"⏳ [Nombre] lleva 2/4 bloques hoy — [Enviar ánimo 👏]"*.
- **Checklist del Día:** Los bloques de videos correspondientes a la semana activa del usuario. Cada ítem permite:
  - Ver el video embebido de YouTube ahí mismo (modal o acordeón expansible sin salir de la app).
  - Marcar el check del día (`daily_checkins`) y/o marcar el video como aprendido en el catálogo general (`video_progress`).

### 5.3. Pestaña 2: 📚 Biblioteca (Los 66 Videos)
- Selector de los **4 Enfoques**:
  1. *Cara y Ortotropía (30 videos)*
  2. *Postura y Cuerpo (15 videos)*
  3. *Fascia y Sistema Nervioso (15 videos)*
  4. *Mentalidad e Integrales (6 videos)*
- Barra de progreso por enfoque y barra global (`X / 66 videos completados`).
- Buscador por texto y filtro por estado (*Todos*, *Por ver*, *Completados*) o categoría (*Diagnóstico*, *Hábito*, *Ejercicio Específico*, *Rutina Completa*).

### 5.4. Pestaña 3: 🤝 Compañeros (Motivación Mutua)
- **Tu Código de Invitación:** Muestra tu código (ej. `PATEL-4A9B`) con botón de copiar/compartir por WhatsApp, y un campo para ingresar el código de tu esposa, familiar o amigo.
- **Tarjetas de Compañeros Vinculados:**
  - Nombre, Semana actual, Racha de días (`🔥`), estado de la rutina de hoy y barras de progreso en los 4 enfoques.
  - Lista de los últimos 3 videos que esa persona completó.
  - Botones rápidos de motivación: *"👏 ¡Gran trabajo hoy!"*, *"🧘 Respira y relaja la fascia"*, *"🔥 ¡Vamos por la rutina de hoy!"* o mensaje personalizado.
- **Muro de Ánimos Recibidos:** Historial de los mensajes que tu pareja o amigos te han enviado.

### 5.5. Pestaña 4: 🔔 Ajustes y Recordatorios
- **Configuración de Recordatorio Diario:** Selector de hora (`HH:MM`) y zona horaria.
- **Notificaciones Push Nativas:** Botón *"Activar notificaciones en este dispositivo"* (registra el Service Worker con la clave pública VAPID) y botón *"Probar notificación ahora"*.
- **Exportar a Calendario:** Botón *"Descargar recordatorios para Google / Apple Calendar (.ics)"* que genera un archivo `.ics` con la rutina diaria a la hora elegida y la guía de la semana en la descripción.
- **Sincronización con Google Sheet (Solo Admin):** Botón para actualizar el catálogo desde la hoja de cálculo original de Google.

---

## 6. Manejo de Errores, Seguridad y Pruebas

1. **Seguridad y Privacidad:**
   - Contraseñas hasheadas con `crypto.scrypt` y `timingSafeEqual`.
   - Los datos de progreso de un usuario solo son visibles para él mismo y para los usuarios con los que tenga un vínculo activo en `connections`.
   - Validación estricta de entradas en todos los endpoints de `/api/*`.
2. **Tolerancia a fallos en Render Free Tier:**
   - El servidor genera automáticamente claves VAPID persistidas en la base de datos si no se definen por variable de entorno, evitando que las suscripciones Push se rompan al reiniciar el contenedor.
   - Si el usuario abre la app sin conexión a internet, el Service Worker muestra el catálogo de los 66 videos y las frases motivadoras desde la caché local.
3. **Verificación y Pruebas:**
   - Script de prueba automatizada (`test.js`) que levanta el servidor en un puerto efímero, verifica el registro de dos usuarios (esposo y esposa), los vincula por código, marca progreso de videos, registra un check-in diario de Semana 1, envía un mensaje de ánimo, verifica el cálculo de racha y comprueba la generación del archivo `.ics`.
   - Verificación de integridad del catálogo (los 66 videos con sus IDs de YouTube extraídos del Google Sheet).
