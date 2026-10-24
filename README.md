# Tesla Chat

Aplicación web de una sola página para conversar con **Nikola Tesla**, impulsada por **Google Gemini**. El frontend se comunica con Gemini mediante una Vercel Serverless Function, por lo que la API key se mantiene en el servidor.

- **Demo en producción:** pendiente de agregar la URL pública de Vercel.
- **Capturas:** pendientes de agregar capturas de las vistas en mobile, tablet y desktop.

## Funcionalidades

- Navegación SPA con History API en `/home`, `/chat` y `/about`, incluyendo atrás/adelante.
- Diseño mobile-first con Flexbox y breakpoints para tablet (768 px) y escritorio (1100 px).
- Chat con historial durante la sesión, scroll automático, indicador de escritura, manejo de errores y reintento, incluido un aviso específico cuando Gemini está temporalmente saturado.
- Cada solicitud envía hasta los 10 mensajes más recientes como contexto.
- System prompt de Nikola Tesla definido en el servidor.
- Generación optimizada para respuestas breves; en modelos Gemini 3 se limita el nivel de razonamiento para reducir la latencia.
- Validación del método y de los mensajes recibidos por la función serverless.
- Tests unitarios con Vitest y mocking de `fetch`.

## Estructura del proyecto

```text
├── api/
│   └── functions.js       # Proxy serverless a Gemini
├── lib/
│   └── systemPrompt.js    # Personalidad e instrucciones de Tesla
├── src/
│   ├── index.html
│   ├── styles.css
│   ├── app.js             # Router SPA
│   ├── chat.js            # Interfaz y lógica del chat
│   └── utils.js           # Utilidades compartidas con la API
├── tests/
│   ├── api.test.js        # Handler serverless y streaming
│   ├── app.test.js        # Lógica de respuesta del chat
│   └── utils.test.js      # Rutas, validación y conversión a Gemini
├── .env.example
├── vercel.json
└── package.json
```

## Requisitos

- Node.js 18 o superior
- API key de Gemini: <https://aistudio.google.com/apikey>
- Vercel CLI para ejecutar localmente la función serverless: `npm install --global vercel`

## Instalación y ejecución local

Desde la carpeta del proyecto:

```bash
npm install
```

Copia `.env.example` a `.env` y agrega tu clave:

```text
GEMINI_API_KEY=tu_clave_de_gemini
```

En Windows PowerShell puedes crear el archivo con:

```powershell
Copy-Item .env.example .env
```

Después, inicia el entorno local de Vercel:

```bash
vercel login
npm start
```

Abre la URL que indique Vercel, normalmente <http://localhost:3000>. `vercel dev` es necesario para que la ruta `/api/functions` llegue a la función serverless. Live Server o un servidor estático solo muestran el frontend y no ejecutan esa función.

## Tests

Ejecuta las pruebas unitarias con:

```bash
npm test
```

Para ejecutarlas en modo watch:

```bash
npm run test:watch
```

## Despliegue en Vercel

1. Importa el repositorio en Vercel y selecciona la carpeta `tesla-chat` como directorio raíz del proyecto, si el repositorio contiene otras carpetas.
2. En **Settings → Environment Variables**, configura `GEMINI_API_KEY` y `GEMINI_MODEL=gemini-3.5-flash` (o un identificador de modelo disponible para tu proyecto). Las variables de Vercel son independientes del archivo `.env` local.
3. Crea un nuevo despliegue para aplicar los cambios de variables y código; luego prueba la página y el chat en la URL asignada.
4. Sustituye el texto de **Demo en producción** al inicio de este README por esa URL.

## Seguridad

- La API key se lee desde `GEMINI_API_KEY` en el servidor; no debe incluirse en el código del frontend ni en el repositorio.
- Los archivos `.env` están excluidos por `.gitignore`; solo se comparte `.env.example`, sin secretos.
- La función valida el método HTTP, el formato y el tamaño del historial antes de llamar a Gemini.

## Uso de IA en el desarrollo

Completa esta tabla con los prompts que utilizaste y las decisiones que tomaste durante el desarrollo:

| Prompt utilizado | Cómo influyó en la implementación | Decisión que tomé |
|---|---|---|
| _Completar con un prompt utilizado_ | _Describir su influencia_ | _Describir la decisión propia_ |
