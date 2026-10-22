/**
 * Config.gs — Todo lo que necesitas tocar está aquí.
 *
 * Cambiar de equipo = cambiar `equipo`, `espnEquipoId`, `espnLiga` y las `consultas`.
 * Para encontrar el id de ESPN de otro club:
 *   https://site.api.espn.com/apis/site/v2/sports/soccer/mex.1/teams
 * (busca el club en la lista y copia su "id"; para otra liga cambia `mex.1`).
 */
var CONFIG = {
  // ---- Identidad -----------------------------------------------------------
  equipo: 'Atlético de San Luis',
  espnEquipoId: '15720', // id del club en ESPN
  espnLiga: 'mex.1', // Liga MX en ESPN
  apodo: 'Los Potosinos',
  escudo: 'https://a.espncdn.com/i/teamlogos/soccer/500/15720.png',
  estadio: 'Estadio Alfonso Lastras Ramírez',
  liga: 'Liga MX',

  // Temporada para la tabla. Si se deja vacío se deduce de la respuesta de ESPN.
  temporada: '',

  // ---- Fuentes de noticias -------------------------------------------------
  idioma: { hl: 'es-419', gl: 'MX', ceid: 'MX:es-419' },

  // Cada consulta es una búsqueda de Google News. Los resultados se mezclan,
  // se limpian y se deduplican (misma noticia en varios medios = 1 tarjeta).
  //
  // Dos formatos válidos:
  //   '"Atlético de San Luis"'                          -> consulta simple
  //   { q: '"Atlético de San Luis" Femenil',
  //     tags: ['Femenil'] }                             -> etiqueta fija
  //
  // Las consultas con `tags` van primero: así sus noticias ya llevan la
  // etiqueta antes de que las demás consultas las repitan.
  consultas: [
    { q: '"Atlético de San Luis" Femenil', tags: ['Femenil'] },
    '"Atlético de San Luis"',
    '"Atletico San Luis"',
    'Atlético San Luis Potosí futbol',
    // Escuela, visorías y torneos infantiles: alimenta la sección de comunidad.
    {
      q:
        '"Atlético de San Luis" (visorías OR "escuela de fútbol" OR "Copa Escuelas"' +
        ' OR "Atleti en tu Escuela" OR "fuerzas básicas")',
      tags: ['Cantera'],
    },
  ],

  // Debe aparecer al menos uno de estos términos en el titular o el medio.
  // 'adsl' es como el club y la prensa abrevian el nombre (Escuela ADSL, Sub-19 ADSL).
  incluir: ['san luis', 'adsl'],

  // Si aparece cualquiera de estos, se descarta (clubes homónimos de otros países).
  excluir: [
    'quillota', // San Luis de Quillota (Chile)
    'san luis obispo', // California
    'saint louis', // EE. UU.
    'st. louis',
    'san luis rio colorado',
    'deportivo san luis',
  ],

  // ---- Comportamiento ------------------------------------------------------
  maxNoticias: 60, // máximo de noticias guardadas en el payload
  maxPorConsulta: 100, // Google News devuelve como máximo 100 por consulta
  cacheSegundos: 900, // 15 min de caché: contenido fresco sin gastar cuota
  umbralDuplicados: 0.72, // 0..1 — qué tan parecidos deben ser dos titulares
  //                        para considerarlos la misma noticia
  timeoutSegundos: 30, // timeout de cada petición HTTP
  // User-Agent. Debe parecer un navegador: ESPN devuelve 403 a los UAs que
  // identifica como bot (probado con "NoticiasASL/1.0" -> 403). Google News RSS
  // acepta este mismo.
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',

  // ---- Datos de partidos y tabla -------------------------------------------
  // Fuente: ESPN (endpoint público, sin clave ni registro). Si falla, la página
  // sigue mostrando noticias: los widgets de partidos se ocultan y el motivo
  // aparece en el diagnóstico del pie. Poner en false para omitirlos.
  mostrarDeportes: true,

  // Cuántos partidos mostrar en cada lista.
  maxProximosPartidos: 3,
  maxUltimosPartidos: 5,

  // Desfase en horas respecto a UTC para mostrar las fechas locales del club.
  // México: UTC-6 (ya no aplica horario de verano). Para otro país, ajústalo.
  desfaseHoras: -6,

  // ---- Redes oficiales del club --------------------------------------------
  // Solo enlaces directos (sin scraping). Tomados de la web oficial del club:
  // atleticodesanluis.mx. Edítalos si cambian los usuarios.
  redes: [
    { nombre: 'X', url: 'https://x.com/AtletideSanLuis' },
    { nombre: 'Instagram', url: 'https://www.instagram.com/atletidesanluis' },
    { nombre: 'YouTube', url: 'https://www.youtube.com/channel/UCF-kaaSSk9rBEHa9MsfsGjA' },
    { nombre: 'Facebook', url: 'https://www.facebook.com/AtletideSanLuis' },
  ],

  // ---- Escuela y comunidad -------------------------------------------------
  // Se alimenta de la consulta marcada con la etiqueta 'Cantera' y de las
  // noticias que hablan de escuela, visorías, clases o torneos infantiles.
  mostrarComunidad: true,
  maxComunidad: 4,
  comunidadTitulo: 'Escuela y comunidad',
  comunidadTexto:
    'Clases, visorías y torneos para niñas, niños y jóvenes del club. ' +
    'Las convocatorias se publican en las cuentas oficiales.',

  // ---- Contenido del club en video ----------------------------------------
  // Feed público (Atom) del canal oficial de YouTube. Es la vía legítima para
  // mostrar contenido con jugadores: el club decide qué publica, así que no se
  // invaden asuntos personales ni se incumplen términos de servicio.
  mostrarVideos: true,
  youtubeCanalId: 'UCF-kaaSSk9rBEHa9MsfsGjA',
  maxVideos: 5,

  // ---- Apariencia ----------------------------------------------------------
  colores: {
    rojo: '#c8102e',
    rojoOscuro: '#8f0a20',
    oro: '#f2c14e',
    fondo: '#0d1117',
    panel: '#161b22',
  },
};
