# 🌿 Pastel Routine — Oscar Patel Routine Tracker PWA

Aplicación Web Progresiva (PWA) para seguir el protocolo progresivo de 66 videos de Oscar Patel (Cara y Ortotropía, Postura y Cuerpo, Fascia y Sistema Nervioso, Mentalidad e Integrales), diseñada para parejas, familiares y amigos.

## Características

- **Plan Progresivo por Semanas (Semana 1, Semana 2 y Semana 3+):** Con checklist diario de hábitos, mapa general y avisos de seguridad biomecánica.
- **Catálogo Completo (66 Videos):** Con reproductor de YouTube integrado, notas personales por ejercicio y sincronización en vivo con Google Sheets.
- **Progreso Compartido y Motivación (`PATEL-XXXX`):** Vincula tu cuenta con la de tu esposa, amigos o familiares para ver rachas diarias (`🔥`), avance por enfoque y enviarse ánimos con notificaciones Push instantáneas.
- **Recordatorios Nativos + Calendario (`.ics`):** Notificaciones Web Push con frases motivadoras contextuales por semana y exportación a Google/Apple Calendar.

## Ejecución Local

```bash
npm install
npm start
```

Para ejecutar las pruebas automatizadas:

```bash
npm test
```

## Despliegue en Render

1. Crea una base de datos PostgreSQL gratuita en [Neon.tech](https://neon.tech) (o Render PostgreSQL) y copia la cadena de conexión (`DATABASE_URL`).
2. En [Render](https://dashboard.render.com), selecciona **New +** -> **Blueprint** (o **Web Service**) y conecta este repositorio de GitHub.
3. Pega tu `DATABASE_URL` cuando Render te la solicite. ¡Listo!
