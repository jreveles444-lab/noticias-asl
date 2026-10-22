# Noticias · Atlético de San Luis

Página de noticias **automatizada y gratuita**. Se alimenta de Google News y de
ESPN (tabla completa y calendario), deduplica las notas que salen en varios
medios y se refresca sola.
**No hay que tocar la página nunca más.**

Se puede publicar en **dos destinos**, desde el mismo motor:

| Destino | Ancho | Cuándo usarlo |
|---|---|---|
| **Google Sites** (secciones 1–9) | hasta 1280 px (tope de Sites) | Si ya tienes el sitio hecho y te vale ese ancho |
| **Sitio estático propio** (sección 10) | 100% de la ventana | Si quieres ancho total, dominio propio gratis y control del diseño |

> **Importante:** Google no permite crear ni editar páginas de Sites nuevo por
> código (el API de Sites solo funciona con Sites clásico, ya retirado). Lo que
> se automatiza es el **contenido**: el sitio se arma una vez a mano y lo que va
> dentro se actualiza solo. Ese es el diseño de este proyecto.

---

## 1. Probarlo en tu computadora (sin cuenta de Google)

Necesitas Node.js 18+ y `curl` (ambos ya vienen en macOS).

```bash
npm run preview        # equivale a: node local/preview.js
open preview/index.html
```

El script ejecuta **el mismo motor** que correrá en Apps Script y escribe el HTML
final en `preview/index.html`. También guarda los datos crudos en
`preview/datos.json` por si quieres inspeccionarlos.

Salida típica:

```
EQUIPO     Atlético de San Luis  (Liga MX)
NOTICIAS   60 tras deduplicar · 27 medios distintos
TABLA      18 filas · temporada 2026 Torneo Apertura
PRÓXIMO    vs Santos Laguna — 2026-10-12T05:00:00.000Z
ÚLTIMO     G 2-1 vs Querétaro
PARTIDOS   3 próximos · 5 resultados
TIEMPO     1.1 s   ·   HTML 62.6 KB
PLANTILLA  marcador sobrevive al saneado de Apps Script ✓   JSON inyectado válido ✓
CATEGORÍAS {"Femenil":27,"Partidos":27,"General":15,"Cantera":1}
CRUZADAS   16 noticias publicadas en varios medios
```

Si `PLANTILLA` no sale con los dos ✓, el preview termina con error y código de
salida 1: revísalo antes de subir nada a Google.

Vista de escritorio y móvil: `preview/vista-escritorio.png`, `preview/vista-movil.png`.

---

## 2. Cómo funciona

```
Google News RSS (5 búsquedas)  ─┐
ESPN (tabla, próximos, resultados) ─┼─► Code.gs ─► limpia, filtra, deduplica
YouTube oficial (videos del club) ─┘      │
                                       ├─► caché 15 min (CacheService)
                                       └─► Index.html + JSON embebido
                                                  │
                                    Google Sites: Insertar → Por URL
```

- **Sin build, sin dependencias, sin npm install.** Solo `Code.gs`, `Config.gs` e `Index.html`.
- **Sin async/await** a propósito: el runtime V8 de Apps Script no lo soporta.
  Las peticiones son síncronas (`UrlFetchApp` en Google, `curl` en local).
- **Render en el navegador:** el servidor solo inyecta el JSON, así que los
  filtros, la búsqueda y las fechas relativas son instantáneos y no gastan cuota.

### ⚠️ La trampa de Apps Script que hay que conocer

**Apps Script borra todos los comentarios de los archivos HTML** antes de
servirlos: los `/* ... */` y `//` de los bloques `<script>`, y los `/* ... */` de
los `<style>`. Lo que está dentro de una cadena (`'...'`, `"..."`) sí se respeta.

Esto rompe el patrón más habitual de plantillas, porque mucha gente marca el
punto de inyección con un comentario:

```js
var DATOS = /*__DATOS_JSON__*/null;   // ❌ Apps Script lo deja como "var DATOS = null;"
```

Por eso los datos van en el **texto** de un bloque de tipo JSON, que sí sobrevive:

```html
<script type="application/json" id="datos-ads">__DATOS_JSON__</script>   <!-- ✅ -->
```

`doGet()` reemplaza **solo el contenido de ese bloque** (con una expresión
regular, no un `replace` global) y luego comprueba que la inyección ocurrió; si
no, lanza un error claro en vez de servir una página en blanco.

El emulador local reproduce este saneado a propósito
(`sanearComoAppsScript()` en `local/gas-shim.js`), y `npm run preview` **falla**
si el marcador no sobrevive. Este proyecto tuvo exactamente ese fallo: el preview
local pasaba porque Node no imita ese borrado. Ya no puede volver a pasar sin que
salte en local.

---

## 3. Desplegar en Apps Script (5 minutos, sin instalar nada)

1. Entra a <https://script.google.com> → **Nuevo proyecto**.
2. Renómbralo a `Noticias ASL`.
3. **Pega el motor:** en el editor abre `Código.gs`, borra todo y pega el
   contenido de `src/Config.gs`. Luego **Archivo → Nuevo → Secuencia de
   comandos**, llámalo `Code`, y pega `src/Code.gs`.
4. **Crea la plantilla:** **Archivo → Nuevo → Archivo HTML**, llámalo
   exactamente `Index` y pega el contenido de `src/Index.html`.
   > El nombre debe ser `Index` (sin `.html`): `doGet()` lo busca así.
5. **Manifiesto:** ⚙️ *Configuración del proyecto* → marca **"Mostrar el archivo
   de manifiesto appsscript.json"**. Vuelve al editor, abre `appsscript.json` y
   pega el contenido de `src/appsscript.json`.
6. **Autoriza:** en el selector de funciones elige `getDatos` → **Ejecutar**.
   Google pedirá permiso para "conectarse a un servicio externo". Acepta.
   Debe aparecer el objeto con las noticias en el registro.
7. **Publica:** **Implementar → Nueva implementación → Aplicación web**:
   - *Ejecutar como:* **Yo**
   - *Quién tiene acceso:* **Cualquier persona**
   - **Implementar** y copia la **URL que termina en `/exec`**.

> ❌ Si usas la URL `/dev` no funcionará embebida: `/dev` solo abre para ti y no
> permite iframes. Sitios necesita la `/exec` con acceso público.

### Con clasp (opcional, si prefieres sincronizar desde esta carpeta)

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "Noticias ASL" --rootDir src
clasp push
clasp deploy --description "v1"
```

`clasp create` genera el `.clasp.json`. Si ya tienes el proyecto creado, copia
`.clasp.json.example` a `.clasp.json` y pega tu `scriptId`
(el `.gitignore` ya excluye ese archivo para no filtrar credenciales).

---

## 4. Embeber en Google Sites

1. Ve a <https://sites.new> → crea un sitio → **Página en blanco**.
2. **Insertar → Insertar (Embed) → Por URL** → pega la URL `/exec` → **Insertar**.
3. Arrastra el bloque por sus esquinas hasta el ancho máximo de la columna.
4. **Publicar** el sitio (botón arriba a la derecha).

### 4.1 Hasta dónde llega el ancho (medido, no supuesto)

Medido sobre una página real de Sites con el embed puesto, a 1440 px de ventana:

```
iframe del embed : x=138   ancho=1154   alto=1637
contenedor padre : max-width: 1280px     ← tope de Google Sites
márgenes         : ~138 px a cada lado (relleno propio de Sites)
```

Conclusiones:

- **El contenido de Sites está limitado a 1280 px y centrado.** No hay ningún
  ajuste en Sites para superarlo; es una decisión de diseño de la plataforma, no
  un problema de este proyecto.
- **La app no añade márgenes propios**: `.wrap` usa `max-width: none`, así que
  ocupa el 100% del bloque que le da Sites (verificado a 1154, 1600 y 2400 px de
  contenedor, sin desbordamiento). Antes tenía un tope de 1120 px que dejaba aire
  extra dentro del bloque.
- **Que no parezca un recuadro flotante**: selecciona la sección →
  **Fondo → Color → personalizado** y usa el mismo fondo que la app, `#0d1117`
  (está en `CONFIG.colores.fondo`). La banda de color pasa a ocupar todo el ancho
  de la ventana y la unión con el iframe se vuelve invisible.
- **Si necesitas que el contenido llegue de borde a borde**, Sites no puede
  hacerlo. La URL `/exec` abierta directamente sí es 100% del ancho de la ventana
  (y es responsive). Alternativas: enlazarla desde el sitio, o publicar el mismo
  motor en un hosting estático (GitHub Pages, Netlify), donde controlas el 100%
  del diseño.


Detalles útiles:

- Dentro del iframe ya funcionan los filtros por categoría, el buscador y
  "Ver más noticias".
- Puedes enlazar una vista ya filtrada añadiendo el hash:
  `.../exec#Femenil`, `.../exec#Fichajes`, `.../exec#Partidos`.
- La primera visita del día tarda 1-3 s (genera y cachea); el resto es instantáneo.

---

## 5. Configuración: cambiar de equipo, colores o fuentes

Todo está en **`src/Config.gs`**, comentado. Lo esencial:

```js
equipo: 'Atlético de San Luis',
espnEquipoId: '15720',   // id del club en ESPN
espnLiga: 'mex.1',       // Liga MX
temporada: '',        // vacío = se deduce del calendario
```

Para adaptarlo a **otro equipo**:

1. Busca su id:
   `https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/teams`
   (busca el club y copia su `id`; el logo está en `logos[0].href` y va en `escudo`).
2. Cambia `equipo`, `equipoId`, `ligaId`, `escudo`, `estadio`, `liga`.
3. Ajusta `consultas` con el nombre del club entre comillas.
4. Revisa `incluir` y `excluir`: son el filtro contra clubes homónimos
   (por ejemplo, "San Luis" también es un equipo chileno y una ciudad de California).

### Etiquetas por consulta

Cada consulta puede ser un texto o un objeto con etiquetas fijas. Sirve para
separar verticales que Google no distingue en el titular (Femenil, Sub-20…):

```js
consultas: [
  { q: '"Atlético de San Luis" Femenil', tags: ['Femenil'] },
  '"Atlético de San Luis"',
],
```

Las consultas con `tags` van **primero**: así sus noticias ya traen la etiqueta
antes de que otra consulta las repita (al deduplicar, las categorías se fusionan).

### 5.1 Redes sociales y contenido del club

**Lo que sí se muestra (automático y legítimo):**

- **Videos del canal oficial de YouTube** (`CONFIG.youtubeCanalId`). Se lee su
  feed público (Atom), sin claves ni scraping, y se muestran las últimas 5 piezas
  con miniatura, etiqueta y fecha. Incluye entrenamientos, conferencias de prensa,
  resúmenes y contenido de patrocinadores con jugadores: es justo el material de
  interés del aficionado.
- **Enlaces a las cuentas oficiales** (`CONFIG.redes`), tomados de la web oficial
  del club: X, Instagram, YouTube y Facebook. Son solo enlaces: no se copia nada.
- **Sección de escuela y comunidad** con las convocatorias para niñas, niños y
  jóvenes (ver 5.2).

**Lo que no se hace, y por qué:**

- **No se leen las cuentas personales de los jugadores.** No es una limitación
  técnica evitable: X cobra por el acceso de lectura, Instagram exige app
  revisada y cuenta profesional, y raspar ambas cosas va contra sus términos de
  servicio. Además, el propio interés del proyecto era evitar la vida privada y
  familiar de los jugadores — y ahí la única fuente fiable es lo que el club
  decide publicar.
- **No se filtran publicaciones por "que hablen del equipo".** Aunque hubiera
  acceso, un filtro automático por palabras no distingue con fiabilidad un
  comentario sobre un partido de una opinión personal: el riesgo de publicar algo
  fuera de lugar es alto y el filtro da una falsa sensación de control.

**Si aun así quieres contenido de jugadores en primera persona:**

- Enlaces fijos a sus cuentas públicas en una sección propia (tú decides cuáles y
  revisas el contenido: es manual, pero no tiene riesgo legal ni de privacidad).
- La categoría **Conferencia** en los videos ya recoge las declaraciones de los
  jugadores ante la prensa, que suele ser lo que más interesa.

### 5.2 Escuela y comunidad

Sección de servicio a la comunidad, pensada para las familias del club: clases,
visorías, torneos infantiles y actividad de fuerzas básicas.

- **Se alimenta sola** de una quinta búsqueda de Google News
  (`visorías OR "escuela de fútbol" OR "Copa Escuelas" OR "Atleti en tu Escuela"
  OR "fuerzas básicas"`), etiquetada como `Cantera`, más la regla de
  categorización que marca como **Escuela** los titulares con escuela, visorías,
  convocatorias, inscripciones o torneos infantiles.
- **Prioriza convocatorias sobre crónicas.** La selección se hace en dos pasadas:
  primero lo etiquetado como `Escuela`; después lo de `Cantera` que **no** sea
  crónica de partido (un Sub-20 ganando no es un servicio a la comunidad).
- **Se arma antes del recorte de `maxNoticias`**, así las convocatorias no
  desaparecen detrás de la actualidad diaria del primer equipo.
- Cierra con enlaces a Instagram y Facebook del club, que es donde se publican
  inscripciones y fechas.

Tamaño y textos se ajustan en `CONFIG` con `maxComunidad` (4),
`comunidadTitulo` y `comunidadTexto`.

### 5.3 Otros ajustes

`maxNoticias` (60), `cacheSegundos` (900), `umbralDuplicados` (0.72 — súbelo si
fusiona noticias distintas, bájalo si se repiten), `mostrarDeportes` y
`mostrarVideos` (false para desactivar cada bloque) y `colores`.

---

## 6. Costos y operación

| Concepto | Costo |
|---|---|
| Apps Script, Google News RSS, ESPN | **$0** |
| Google Sites (URL `sites.google.com/view/...`) | **$0** |
| Dominio propio en Sites | requiere Google Workspace (~$7 USD/mes) |
| Anuncios | **no se puede**: Sites no admite AdSense |

Consumo: cada refresco hace 5 peticiones HTTP. Con la caché de 15 min son como
mucho ~480 peticiones al día, muy por debajo del límite de `UrlFetchApp`
(20 000/día en cuentas personales). **No necesitas triggers.**

Opcional, en el editor de Apps Script:

- `instalarTrigger()` — calienta la caché cada 15 min (útil si tienes mucho tráfico).
- `limpiarCache()` — bórrala después de cambiar `Config.gs`, si no tardarás
  hasta 15 min en ver los cambios.
- `getDatos()` — imprime el JSON crudo para depurar.

**Tras editar el código**: los cambios no llegan a la URL `/exec` hasta que hagas
**Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar**.
Es el error más común.

---

## 7. Limitaciones (honestas)

- **La tabla es completa** (18 equipos en Liga MX) y los partidos vienen de ESPN:
  hasta 3 próximos y 5 resultados recientes. Antes se usaba TheSportsDB, cuyo plan
  gratuito recortaba la tabla a 5 filas y cuya clave de prueba fue retirada.
- **ESPN es un endpoint público no documentado.** No requiere clave ni registro y
  lleva años estable, pero no hay contrato de servicio: si algún día cambia, los
  widgets de partidos desaparecen (las noticias siguen) y el motivo aparece en el
  diagnóstico del pie.
- **Google News RSS devuelve 100 notas por búsqueda como máximo**, y no incluye
  resumen del artículo. Por eso las tarjetas muestran titular, medio y enlace.
- **La deduplicación es heurística** (similitud de bigramas del titular). Puede
  dejar pasar dos versiones de la misma noticia con titulares muy distintos, o
  fusionar dos notas parecidas. Ajusta `umbralDuplicados`.
- **Los enlaces apuntan a Google News**, que redirige al medio original. Es
  estable, pero si un medio cambia la nota, el enlace se rompe igual que en cualquier agregador.
- **Sin resumen ni foto**: no se copia contenido de los medios, solo se enlaza y acredita.

### Legal

Es un agregador: se publica **titular + nombre del medio + enlace** con
atribución visible ("También en: …") y aviso en el pie. No se reproduce el
cuerpo de los artículos ni se alojan imágenes de los medios. Para uso comercial
serio, revisa los términos de Google News RSS y de cada medio.

---

## 8. Estructura

```
Config.gs              ← TODO lo editable: equipo, fuentes, colores
Code.gs                ← motor: RSS, filtros, dedupe, partidos, doGet()
Index.html             ← interfaz (HTML+CSS+JS, sin dependencias)
appsscript.json        ← manifiesto (V8 + acceso público para el iframe)
```

```
Noticias/
├── src/                     ← esto es lo que se sube a Apps Script
│   ├── Config.gs
│   ├── Code.gs
│   ├── Index.html
│   └── appsscript.json
├── local/                   ← pruebas y emulación en local
│   ├── gas-shim.js          ← emula UrlFetchApp/HtmlService con curl y el saneado de HTML de Apps Script
│   ├── validar.js           ← comprueba el marcador de plantilla y el JSON inyectado
│   └── preview.js           ← ejecuta doGet() y genera preview/
├── sitio/                   ← versión para hosting propio
│   └── construir.js         ← genera dist/ (index.html, 404.html, robots.txt…)
├── .github/workflows/
│   ├── publicar.yml         ← reconstruye cada hora y publica en GitHub Pages
│   └── netlify-cron.yml     ← dispara el build hook de Netlify cada hora
├── dist/                    ← sitio generado (ignorado por git)
├── preview/                 ← generado (ignorado por git)
├── netlify.toml             ← despliegue sin configuración en Netlify
├── vercel.json              ← despliegue sin configuración en Vercel
├── .clasp.json.example
├── package.json
└── README.md
```

---

## 9. Problemas comunes

| Síntoma | Causa |
|---|---|
| El iframe de Sites sale **en blanco** | La implementación no tiene acceso **"Cualquier persona"**, o estás usando la URL `/dev` en vez de `/exec`. |
| La página dice **"No se pudieron cargar las noticias — El servidor no reemplazó el marcador `__DATOS_JSON__`"** | El `Index.html` de Apps Script no tiene el bloque `<script type="application/json" id="datos-ads">__DATOS_JSON__</script>`, o `Code.gs` es una versión antigua que buscaba `/*__NEWS_DATA__*/`. Vuelve a pegar ambos archivos del repo y publica una **nueva versión**. |
| La página dice **"...no es JSON válido"** | El bloque de datos quedó cortado al copiar y pegar, o alguien metió el marcador dentro de un comentario. Ejecuta `npm run preview`: lo detecta antes de publicar. |
| **No aparece ninguna noticia** | El bloque `excluir` de `Config.gs` está filtrando de más, o la consulta no devuelve resultados. Mira el bloque **"Diagnóstico de fuentes"** al pie de la página. |
| **Cambié el código y no veo cambios** | Falta crear una **nueva versión** de la implementación, y además la caché de 15 min. Usa `limpiarCache()`. |
| **Faltan los partidos o la tabla** | Mira el diagnóstico al pie. Si dice **HTTP 403**, suele ser el User-Agent: ESPN bloquea los que parecen bot. Usa uno de navegador en `CONFIG.userAgent` (el del repo ya lo es). Si dice **HTTP 429**, son demasiadas peticiones: sube `cacheSegundos`. La página sigue funcionando con noticias aunque falle. |
| **Noticias de otro "San Luis"** | Agrega el término a `excluir` en `Config.gs`. |
| **No aparecen los videos del club** | El feed de YouTube falló o el `youtubeCanalId` cambió. Verifica en <https://www.youtube.com/feeds/videos.xml?channel_id=UCF-kaaSSk9rBEHa9MsfsGjA>. Revisa el diagnóstico al pie. |
| **Las miniaturas de video salen vacías** | `i.ytimg.com` bloqueado por un filtro de red (algunas redes corporativas). El enlace sigue funcionando. |
| **La sección "Escuela y comunidad" no aparece** | No hubo noticias que cumplieran el criterio. La sección se oculta en vez de mostrarse vacía. Revisa la consulta de comunidad en `CONFIG.consultas` y sube `maxComunidad` si quieres más. |
| Todo el bloque se ve **muy estrecho** | Es el tope de 1280 px de Google Sites, no un error del proyecto. Ver la sección 4.1. Si necesitas ancho total, usa la sección 10. |

---

## 10. Alternativa: sitio propio en otra plataforma (ancho total)

Si el límite de 1280 px de Sites te queda corto, esta carpeta también genera un
**sitio estático completo** que se publica en cualquier hosting y ocupa el
**100% del ancho de la ventana**.

No hay lógica duplicada: `sitio/construir.js` ejecuta el mismo `src/Code.gs`
a través del emulador y escribe el HTML final. Si cambias el equipo o las
fuentes, cambia en los dos destinos a la vez.

```bash
npm run sitio          # genera dist/
npm run sitio:abrir    # genera y lo abre en el navegador
npm run sitio:servir   # genera y sirve en http://localhost:8080
```

Salida de `npm run sitio`:

```
EQUIPO     Atlético de San Luis  (Liga MX)
NOTICIAS   60 · 31 medios
TABLA      18 filas · temporada 2026 Torneo Apertura
TIEMPO     1.4 s

Archivos generados en dist/:
  .nojekyll       0.0 KB
  404.html        0.8 KB
  datos.json      39.5 KB
  index.html      56.2 KB
  robots.txt      0.0 KB
```

### Opciones de publicación (todas gratuitas)

| Plataforma | Automatización | Qué hay que hacer |
|---|---|---|
| **GitHub Pages** | ✅ Sí, cada hora con el workflow incluido | Subir el repo y activar *Settings → Pages → Source: GitHub Actions* |
| **Netlify** | ✅ Con *build hook* + cron (no tiene builds programados) | Conectar el repo; ya hay `netlify.toml` y el workflow `netlify-cron.yml` |
| **Vercel** | ⚠️ Requiere cron externo o *Deploy Hook* | Conectar el repo; ya hay `vercel.json` |
| **Cloudflare Pages** | ⚠️ Requiere *Deploy Hook* + cron | Build: `node sitio/construir.js`, salida: `dist` |
| Cualquier hosting de archivos | ❌ Manual | Subir el contenido de `dist/` |

### Netlify paso a paso

Tres formas, de menos a más automatización. El proyecto ya viene configurado
(`netlify.toml` con el comando de build, la carpeta de publicación y
`NODE_VERSION`), así que no hay que tocar nada en la interfaz de build.

**A. Sin cuenta y sin git — "Netlify Drop" (30 segundos, pero manual)**

```bash
npm run sitio          # genera dist/
```
Luego entra en <https://app.netlify.com/drop> y arrastra **la carpeta `dist/`**
(no la carpeta del proyecto). Te da una URL al instante.

> ⚠️ Así el sitio queda **congelado**: Netlify no reconstruye nada. Para
> actualizarlo hay que volver a arrastrar `dist/`.

**B. Conectado a GitHub (se reconstruye al hacer push)**

1. Repo en GitHub con los archivos del proyecto, usando las rutas explícitas del
   apartado de GitHub Pages de abajo (⚠️ no `git add .`).
2. En Netlify: **Add new site → Import an existing project → GitHub** → elige el
   repo.
3. Netlify lee `netlify.toml` y rellena solo:
   - **Build command:** `node sitio/construir.js`
   - **Publish directory:** `dist`
4. **Deploy site**. Cada `git push` a `main` reconstruye y publica.

Con esto se actualiza cuando cambias el código, **no cada hora**.

**C. Actualización automática cada hora (gratis)**

Netlify ya no documenta *builds programados*; la vía oficial son los
[*build hooks*](https://docs.netlify.com/build/configure-builds/build-hooks/),
que son URLs que disparan un build al recibir un POST.

1. En Netlify: **Project configuration → Developer settings → Continuous
   deployment → Build hooks → Add build hook**. Ponle nombre (`cron`) y elige la
   rama `main`. Copia la URL (`https://api.netlify.com/build_hooks/XXXX`).
2. Dispara ese hook cada hora desde fuera. Dos opciones:
   - **GitHub Actions** (incluido): guarda la URL en
     **Settings → Secrets and variables → Actions → New repository secret** con
     el nombre `NETLIFY_BUILD_HOOK`. El workflow
     `.github/workflows/netlify-cron.yml` ya dispara el build cada hora en el
     minuto 23.
   - **Sin GitHub**: crea un cron en <https://cron-job.org> o EasyCron apuntando
     a esa URL con método **POST**.

Comprobación manual del hook:

```bash
curl -X POST -d '{}' https://api.netlify.com/build_hooks/TU_HOOK
```

**Ventaja frente a Google Sites:** en Netlify el dominio propio y el HTTPS son
gratis, sin necesidad de Google Workspace.

**Si falla:** el build es `node sitio/construir.js`, así que reproduce el error en
local con `npm run sitio`. Los dos motivos más probables son que falte `curl` en
el entorno (el script lo dice explícitamente) o que las fuentes devuelvan menos de
5 noticias (el build se detiene a propósito para no publicar una portada vacía;
se fuerza con `--permitir-vacio`).

### GitHub Pages paso a paso (la opción automática sin coste)

1. Crea un repositorio en GitHub y sube **solo los archivos de este proyecto**.
   ⚠️ **No uses `git add .`**: esta carpeta contiene otros proyectos (mi-salud,
   volantes-compartidos, etc.) y los subirías todos. Añade las rutas explícitas:
   ```bash
   git init
   git add src local sitio .github .gitignore package.json netlify.toml vercel.json README.md
   git commit -m "Noticias del Atlético de San Luis"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPO.git
   git push -u origin main
   ```
   `.github/workflows/publicar.yml` tiene que quedar en la raíz del repo o el
   workflow no se ejecuta. `preview/`, `dist/` y `.clasp.json` están en
   `.gitignore`, así que no se suben aunque los añadas.
2. En el repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Pestaña **Actions**: el workflow *Publicar noticias* corre al hacer push, cada
   hora (minuto 13) y a mano con **Run workflow**.
4. La URL queda en `https://TU-USUARIO.github.io/TU-REPO/`.

El workflow **no publica una portada vacía**: si se obtienen menos de 5 noticias,
el job falla (y GitHub te avisa por correo) en lugar de dejar el sitio en blanco.
Para forzarlo: `node sitio/construir.js --permitir-vacio`.

### Diferencias con la versión de Sites

| | Apps Script + Sites | Sitio estático |
|---|---|---|
| Frecuencia de actualización | ~15 min (caché en cada visita) | Cada hora (cron) |
| Ancho máximo | 1280 px (tope de Sites) | 100% de la ventana |
| Dominio propio | Requiere Workspace (~$7 USD/mes) | Gratis en GitHub Pages |
| Cuenta necesaria | Google | GitHub / Netlify |
| Datos al abrir | En vivo, desde la caché | Los del último build |
| Mantenimiento | Ninguno | Ninguno |

### Ojo con esto

- `dist/` está en `.gitignore`: se reconstruye en cada publicación, no se sube al repo.
- No hay backend, ni base de datos, ni coste variable: son archivos estáticos.
- El HTML se renderiza en el navegador desde el JSON embebido. Los buscadores
  modernos ejecutan JavaScript y lo indexan, pero si algún día necesitas HTML ya
  renderizado (SEO clásico), habría que mover el render a `construir.js`.
