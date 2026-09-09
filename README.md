# 🏛️ Servidor API Scraper de ONPE

Servidor autónomo basado en **Node.js, Express y Puppeteer Headless** diseñado para consultar la plataforma oficial de la **ONPE** en tiempo real y extraer automáticamente:

- **Local de Votación**
- **Dirección del Local y Referencias**
- **Mesa de Sufragio y Nº de Orden**
- **Ubigeo Electoral (Departamento / Provincia / Distrito)**
- **Condición de Miembro de Mesa**
- **Geolocalización (Latitud / Longitud)**

---

## 📁 Estructura de la Carpeta `server/`

```text
server/
├── Dockerfile          # Imagen Docker lista para producción (Debian + Google Chrome Stable)
├── .dockerignore       # Optimización para no subir node_modules al construir
├── index.js            # API REST Express (CORS habilitado para Netlify y Localhost)
├── onpeScraper.js      # Motor Scraper con Puppeteer, bypass AWS WAF y caché en memoria
├── package.json        # Dependencias del servidor (express, cors, puppeteer-core)
├── start.bat           # Acceso directo para iniciar en Windows
├── install.bat         # Acceso directo para instalar dependencias en Windows
└── README.md           # Guía de despliegue y uso
```

---

## 🚀 Opción 1: Despliegue Gratuito en Render.com (Recomendado)

Render permite alojar el contenedor Docker de forma gratuita y con HTTPS automático.

1. **Crear cuenta:**
   - Ingresa a [https://render.com/](https://render.com/) e inicia sesión con tu cuenta de GitHub.

2. **Crear nuevo servicio:**
   - Haz clic en el botón superior **`New +`** y elige **`Web Service`**.
   - Conecta tu repositorio de GitHub (`geo-padron-ok`).

3. **Configurar los parámetros:**
   - **Name:** `onpe-scraper-api`
   - **Region:** `Oregon (US West)` o la más cercana.
   - **Root Directory:** `server`
   - **Environment:** `Docker` *(Render detectará automáticamente el Dockerfile en `server/` e instalará Chrome sin configurar nada más)*.
   - **Instance Type:** `Free` ($0.00 / mes).

4. **Crear y Esperar:**
   - Clic en **`Create Web Service`**.
   - En ~2 minutos el estado cambiará a `Live`.
   - Copia la URL pública generada (ejemplo: `https://onpe-scraper-api.onrender.com`).

---

## 🚆 Opción 2: Despliegue en Railway.app

1. Ingresa a [https://railway.app/](https://railway.app/).
2. Haz clic en **`New Project`** -> **`Deploy from GitHub repo`**.
3. Selecciona tu repositorio.
4. En los ajustes de servicio (**Settings**):
   - **Root Directory:** `/server`
   - **Builder:** `Dockerfile`
5. En **Networking**, haz clic en **`Generate Domain`** para obtener tu URL pública HTTPS.

---

## 🔗 Cómo Conectar el Servidor con tu Frontend en Netlify

Una vez que tengas tu URL de Render o Railway (ejemplo: `https://onpe-scraper-api.onrender.com`):

1. Abre el archivo `.env` en la raíz de tu proyecto `geo-padron-ok` (o créalo basándote en `.env.example`).
2. Agrega la variable:
   ```env
   VITE_ONPE_API_URL=https://onpe-scraper-api.onrender.com
   ```
3. Ejecuta **`6_COMPILAR_WEB.bat`** para generar la compilación de producción.
4. Sube la carpeta `dist/` a **Netlify** (o haz push a GitHub si tienes Netlify conectado).
5. ¡Listo! Al hacer clic en **"Validar en Reniec"** en tu web `https://podemosperu.netlify.app/`, el sistema consultará en paralelo a RENIEC y al servidor ONPE en la nube.

---

## 💻 Opción 3: Ejecución Local en Windows

Si deseas probar el servidor en tu computadora:

1. Ejecuta **`server/install.bat`** (solo la primera vez).
2. Ejecuta **`server/start.bat`** o el archivo **`9_INICIAR_SERVER_ONPE.bat`** en la raíz.
3. El servidor iniciará en:
   ```text
   http://localhost:3000
   ```
4. Prueba en tu navegador:
   ```text
   http://localhost:3000/api/consultar-onpe/42773638
   ```
