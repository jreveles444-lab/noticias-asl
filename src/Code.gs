/**
 * Code.gs — Motor de noticias y datos del Atlético de San Luis.
 *
 * IMPORTANTE: este archivo es 100% síncrono a propósito. El runtime V8 de
 * Apps Script no soporta async/await ni Promises, así que UrlFetchApp se usa
 * de forma bloqueante. El shim local (local/gas-shim.js) emula exactamente la
 * misma interfaz, de modo que este mismo código corre en Node sin cambios.
 */

// ===========================================================================
// Punto de entrada del Web App
// ===========================================================================

/**
 * Sirve la página. Google Sites la embebe en un iframe, por eso se usa
 * XFrameOptionsMode.ALLOWALL (sin esto, Sites muestra el iframe en blanco).
 */
function doGet(e) {
  var datos = getPayload_();
  var plantilla = HtmlService.createHtmlOutputFromFile('Index').getContent();

  // El marcador vive en el TEXTO de un bloque <script type="application/json">,
  // nunca en un comentario: Apps Script elimina todos los comentarios de los
  // archivos HTML y un marcador-comentario desaparecería antes de llegar aquí.
  //
  // '<' se escapa como \u003c para que ningún titular pueda cerrar el bloque
  // con "</script". JSON.parse lo vuelve a convertir en '<' en el navegador.
  var json = JSON.stringify(datos)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  // Sustitución quirúrgica: solo el contenido del bloque de datos, nunca otra
  // aparición del marcador (por ejemplo, la que hay en el texto del diagnóstico).
  var html = plantilla.replace(
    /(<script[^>]*id="datos-ads"[^>]*>)([\s\S]*?)(<\/script>)/i,
    function (todo, apertura, contenido, cierre) {
      return apertura + json + cierre;
    }
  );

  // Comprobación: si el bloque sigue teniendo el marcador, algo no cuadra y es
  // mejor fallar con un mensaje claro que servir una página vacía.
  var bloque = /<script[^>]*id="datos-ads"[^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (!bloque || bloque[1].indexOf('__DATOS_JSON__') !== -1) {
    throw new Error(
      'No se pudo inyectar el JSON. Comprueba que el archivo HTML se llama exactamente ' +
        '"Index" y que contiene <script type="application/json" id="datos-ads">__DATOS_JSON__</script>.'
    );
  }

  return HtmlService.createHtmlOutput(html)
    .setTitle('Noticias · ' + CONFIG.equipo)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Devuelve solo el JSON. Útil para depurar en el editor de Apps Script. */
function getDatos() {
  return getPayload_();
}

/**
 * Opcional: crea un trigger cada 15 min para que la caché siempre esté
 * caliente y el primer visitante no espere. Ejecutar UNA vez a mano.
 */
function instalarTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'calentarCache') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('calentarCache').timeBased().everyMinutes(15).create();
  return 'Trigger instalado: calentarCache cada 15 minutos.';
}

/** Solo para el trigger. */
function calentarCache() {
  CacheService.getScriptCache().remove(CLAVE_CACHE_);
  getPayload_();
}

/** Borra la caché. Útil tras cambiar la configuración. */
function limpiarCache() {
  CacheService.getScriptCache().remove(CLAVE_CACHE_);
  return 'Caché borrada.';
}

// ===========================================================================
// Payload con caché
// ===========================================================================

/**
 * Versión del formato del payload. Se cambia al modificar la ESTRUCTURA de los
 * datos: así un redespliegue no sirve desde la caché un formato antiguo que la
 * interfaz ya no entiende.
 *   v2 — tabla completa de ESPN, listas `proximos` y `ultimos`.
 */
var CLAVE_CACHE_ = 'asl_payload_v2';

function getPayload_() {
  var clave = CLAVE_CACHE_;
  var cache = CacheService.getScriptCache();

  var guardado = cache.get(clave);
  if (guardado) {
    try {
      return JSON.parse(guardado);
    } catch (err) {
      /* caché corrupta: se regenera */
    }
  }

  var payload = construirPayload_();

  try {
    var texto = JSON.stringify(payload);
    if (texto.length < 95000) cache.put(clave, texto, CONFIG.cacheSegundos);
  } catch (err) {
    /* si no cabe en caché, simplemente se regenera cada vez */
  }
  return payload;
}

function construirPayload_() {
  var avisos = [];
  var recogidas = recolectarNoticias_(avisos);
  var noticias = recogidas.noticias;
  var comunidad = recogidas.comunidad;

  var deportes = { proximo: null, proximos: [], ultimo: null, ultimos: [], tabla: [], temporada: '', fuenteDatos: '' };
  if (CONFIG.mostrarDeportes) {
    try {
      deportes = recolectarDeportes_(avisos);
    } catch (err) {
      avisos.push('Datos de partidos no disponibles: ' + err);
    }
  }

  var videos = [];
  if (CONFIG.mostrarVideos) {
    try {
      videos = recolectarVideos_(avisos);
    } catch (err) {
      avisos.push('Videos no disponibles: ' + err);
    }
  }

  var fuentes = {};
  for (var i = 0; i < noticias.length; i++) fuentes[noticias[i].fuente] = 1;

  return {
    generadoISO: new Date().toISOString(),
    equipo: {
      nombre: CONFIG.equipo,
      apodo: CONFIG.apodo,
      escudo: CONFIG.escudo,
      estadio: CONFIG.estadio,
      liga: CONFIG.liga,
    },
    proximo: deportes.proximo,
    proximos: deportes.proximos,
    ultimo: deportes.ultimo,
    ultimos: deportes.ultimos,
    tabla: deportes.tabla,
    temporada: deportes.temporada,
    fuenteDatos: deportes.fuenteDatos,
    noticias: noticias,
    comunidad: comunidad,
    comunidadTexto: CONFIG.comunidadTexto,
    comunidadTitulo: CONFIG.comunidadTitulo,
    videos: videos,
    redes: CONFIG.redes || [],
    totalFuentes: Object.keys(fuentes).length,
    avisos: avisos,
    colores: CONFIG.colores,
  };
}

// ===========================================================================
// Noticias: Google News RSS
// ===========================================================================

function recolectarNoticias_(avisos) {
  var todos = [];
  var vistosEnlace = {};

  for (var i = 0; i < CONFIG.consultas.length; i++) {
    // Cada consulta puede ser un texto simple o { q, tags }.
    var definicion = CONFIG.consultas[i];
    var consulta = typeof definicion === 'string' ? definicion : definicion.q;
    var tagsFijos = typeof definicion === 'string' ? [] : definicion.tags || [];

    var url = urlGoogleNews_(consulta);
    var res = descargar_(url);
    if (!res.ok) {
      avisos.push('Google News: ' + describirCodigo_(res.codigo) + ' para la consulta ' + consulta);
      continue;
    }

    var items = extraerItems_(res.texto);
    if (!items.length) {
      avisos.push('La consulta no devolvió noticias: ' + consulta);
      continue;
    }

    for (var j = 0; j < items.length && j < CONFIG.maxPorConsulta; j++) {
      var item = items[j];
      if (!item.enlace || vistosEnlace[item.enlace]) continue;
      vistosEnlace[item.enlace] = 1;
      if (!esRelevante_(item)) continue;
      if (tagsFijos.length) item.categorias = unirCategorias_(tagsFijos, item.categorias);
      todos.push(item);
    }
  }

  todos = deduplicar_(todos);
  todos.sort(function (a, b) {
    return (b.fechaISO || '').localeCompare(a.fechaISO || '');
  });

  // La sección de comunidad se arma ANTES del recorte de maxNoticias: si no,
  // las convocatorias de la escuela se perderían detrás de la actualidad diaria.
  var comunidad = [];
  if (CONFIG.mostrarComunidad) {
    // Prioridad 1: convocatorias de escuela, visorías y torneos infantiles.
    // Prioridad 2: noticias de academia que NO sean crónicas de partido
    // (una crónica del Sub-20 no es un servicio a la comunidad).
    var tomar = function (cumple) {
      for (var k = 0; k < todos.length && comunidad.length < CONFIG.maxComunidad; k++) {
        if (comunidad.indexOf(todos[k]) !== -1) continue;
        if (cumple(todos[k])) comunidad.push(todos[k]);
      }
    };
    var tieneEtiqueta = function (n, etiqueta) {
      return (n.categorias || []).indexOf(etiqueta) !== -1;
    };

    tomar(function (n) {
      return tieneEtiqueta(n, 'Escuela');
    });
    tomar(function (n) {
      return tieneEtiqueta(n, 'Cantera') && !tieneEtiqueta(n, 'Partidos');
    });
  }

  return { noticias: todos.slice(0, CONFIG.maxNoticias), comunidad: comunidad };
}

function urlGoogleNews_(consulta) {
  return (
    'https://news.google.com/rss/search?q=' +
    encodeURIComponent(consulta) +
    '&hl=' +
    CONFIG.idioma.hl +
    '&gl=' +
    CONFIG.idioma.gl +
    '&ceid=' +
    CONFIG.idioma.ceid
  );
}

function extraerItems_(xml) {
  var items = [];
  var re = /<item>([\s\S]*?)<\/item>/g;
  var m;

  while ((m = re.exec(xml)) !== null) {
    var bloque = m[1];
    var titulo = limpiarTexto_(etiqueta_(bloque, 'title'));
    var fuenteCruda = limpiarTexto_(etiqueta_(bloque, 'source'));
    var fuente = fuenteCruda;

    // Algunas fuentes llegan como URL completa ("https://www.elexpres.com/").
    // Se muestra el dominio, que es lo que reconoce el lector.
    if (/^https?:\/\//i.test(fuente)) {
      fuente = fuente.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '');
    }
    var fechaCruda = limpiarTexto_(etiqueta_(bloque, 'pubDate'));

    // Google News añade " - Medio" al final del titular: se quita. Se prueba con
    // el nombre original Y con el dominio, porque el titular puede traer
    // cualquiera de las dos formas.
    var sufijos = [fuenteCruda, fuente];
    for (var q = 0; q < sufijos.length; q++) {
      if (!sufijos[q]) continue;
      titulo = titulo
        .replace(new RegExp('\\s*[-–|]\\s*' + escaparRegex_(sufijos[q]) + '\\s*$', 'i'), '')
        .trim();
    }

    if (!titulo) continue;

    items.push({
      titulo: titulo,
      enlace: limpiarTexto_(etiqueta_(bloque, 'link')),
      fuente: fuente || 'Medio desconocido',
      fechaISO: aISO_(fechaCruda),
      categorias: categorizar_(titulo),
      tambienEn: [],
    });
  }
  return items;
}

function esRelevante_(item) {
  var texto = normalizar_(item.titulo + ' ' + item.fuente);
  var i;

  for (i = 0; i < CONFIG.incluir.length; i++) {
    if (texto.indexOf(normalizar_(CONFIG.incluir[i])) !== -1) break;
    if (i === CONFIG.incluir.length - 1) return false;
  }
  for (i = 0; i < CONFIG.excluir.length; i++) {
    if (texto.indexOf(normalizar_(CONFIG.excluir[i])) !== -1) return false;
  }
  return true;
}

/**
 * Une la misma noticia publicada en varios medios. El titular que se conserva
 * es el del medio de mayor "peso"; los demás se listan en `tambienEn`.
 */
function deduplicar_(items) {
  var conservados = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var b = bigramas_(item.titulo);
    var duplicado = false;

    for (var j = 0; j < conservados.length; j++) {
      if (similitud_(b, conservados[j]._bigramas) >= CONFIG.umbralDuplicados) {
        if (conservados[j].fuente !== item.fuente) {
          conservados[j].tambienEn.push(item.fuente);
        }
        // La misma noticia puede venir etiquetada distinto según la consulta
        // que la trajo ("General" en una, "Femenil" en otra): se unen.
        conservados[j].categorias = unirCategorias_(conservados[j].categorias, item.categorias);
        duplicado = true;
        break;
      }
    }

    if (!duplicado) {
      item._bigramas = b;
      conservados.push(item);
    }
  }

  for (var k = 0; k < conservados.length; k++) delete conservados[k]._bigramas;
  return conservados;
}

/**
 * Une dos listas de categorías sin repetir. Si queda más de una, se descarta
 * "General" porque deja de aportar información.
 */
function unirCategorias_(a, b) {
  var vistos = {};
  var salida = [];
  var todos = (a || []).concat(b || []);

  for (var i = 0; i < todos.length; i++) {
    var c = todos[i];
    if (!c || vistos[c]) continue;
    vistos[c] = 1;
    salida.push(c);
  }

  if (salida.length > 1) {
    salida = salida.filter(function (c) {
      return c !== 'General';
    });
  }
  return salida.length ? salida : ['General'];
}

function categorizar_(titulo) {
  var t = normalizar_(titulo);
  var cats = [];

  if (/femenil|femenina|women|liguilla femenil/.test(t)) cats.push('Femenil');
  if (/escuela|visorias?|atleti en tu escuela|clases? de futbol|copa escuelas|convocatoria|inscripcion|infantil|ninas|ninos/.test(t))
    cats.push('Escuela');
  if (/sub-?(17|18|20|21|23)|cantera|juvenil|fuerzas basicas/.test(t)) cats.push('Cantera');
  if (/fichaje|refuerzo|traspaso|mercado de pases|rumor|fichar|nuevo jugador|se va|sale del/.test(t))
    cats.push('Fichajes');
  if (/lesion|baja por|sancion|expulsad|parte medico|operacion|desgarre|esguince/.test(t))
    cats.push('Bajas');
  if (/vs\.?\s|contra |jornada|previa|resumen|goles|empate|victoria|derrota|alineacion|calendario/.test(t))
    cats.push('Partidos');

  if (!cats.length) cats.push('General');
  return cats;
}

// ===========================================================================
// Partidos y tabla: ESPN (endpoint público, sin clave ni registro)
//
// Un solo proveedor para todo. Se sustituyó TheSportsDB porque su plan gratuito
// recortaba la tabla a 5 equipos (de 18) y además retiró su clave de prueba.
// Aquí son 3 peticiones por refresco: tabla, próximos y resultados.
// ===========================================================================

/** URL base de la API "site" de ESPN para la liga configurada. */
function urlEspn_(ruta) {
  return 'https://site.api.espn.com/apis/site/v2/sports/soccer/' + CONFIG.espnLiga + '/' + ruta;
}

/** La tabla vive en otro prefijo (/apis/v2/) que el resto. */
function urlEspnTabla_() {
  return 'https://site.api.espn.com/apis/v2/sports/soccer/' + CONFIG.espnLiga + '/standings';
}

function recolectarDeportes_(avisos) {
  var salida = {
    proximo: null,
    proximos: [],
    ultimo: null,
    ultimos: [],
    tabla: [],
    temporada: '',
    fuenteDatos: 'ESPN',
  };

  // 1) Tabla completa (los 18 equipos de la Liga MX).
  try {
    var tabla = tablaEspn_(avisos);
    salida.tabla = tabla.filas;
    salida.temporada = tabla.temporada;
  } catch (err) {
    avisos.push('No se pudo leer la tabla: ' + err);
  }

  // 2) Próximos partidos (el más cercano primero).
  var proximos = partidosEspn_(true, avisos);
  if (proximos.length) {
    salida.proximos = proximos.slice(0, CONFIG.maxProximosPartidos);
    salida.proximo = salida.proximos[0];
  }

  // 3) Resultados (el más reciente primero).
  var jugados = partidosEspn_(false, avisos);
  if (jugados.length) {
    salida.ultimos = jugados.slice(0, CONFIG.maxUltimosPartidos);
    salida.ultimo = salida.ultimos[0];
  }

  if (!salida.temporada) salida.temporada = CONFIG.temporada;

  return salida;
}

/** Lee la tabla completa y la normaliza al formato de la interfaz. */
function tablaEspn_(avisos) {
  var res = pedirJson_(urlEspnTabla_(), avisos);
  var filas = [];
  var temporada = '';

  if (!res || !res.children || !res.children.length) {
    avisos.push('ESPN no devolvió la tabla de la liga.');
    return { filas: filas, temporada: temporada };
  }

  var grupo = res.children[0];
  temporada = grupo.name || '';
  var entradas = (grupo.standings && grupo.standings.entries) || [];

  for (var i = 0; i < entradas.length; i++) {
    var e = entradas[i];
    var st = {};
    var stats = e.stats || [];
    for (var j = 0; j < stats.length; j++) st[stats[j].name] = stats[j].displayValue;

    var equipo = (e.team && (e.team.displayName || e.team.name)) || '';
    var escudos = (e.team && e.team.logos) || [];

    filas.push({
      rank: parseInt(st.rank, 10) || i + 1,
      equipo: equipo,
      escudo: escudos.length ? escudos[0].href : '',
      pj: st.gamesPlayed || '0',
      g: st.wins || '0',
      e: st.ties || '0',
      p: st.losses || '0',
      dg: st.pointDifferential || '0',
      pts: st.points || '0',
      nosotros:
        (e.team && String(e.team.id) === String(CONFIG.espnEquipoId)) ||
        normalizar_(equipo) === normalizar_(CONFIG.equipo),
    });
  }

  return { filas: filas, temporada: temporada };
}

/**
 * Partidos del equipo. `fixture = true` -> próximos; `false` -> ya jugados.
 * Los devuelve ordenados: próximos del más cercano al más lejano, jugados del
 * más reciente al más antiguo.
 */
function partidosEspn_(fixture, avisos) {
  var res = pedirJson_(
    urlEspn_('teams/' + CONFIG.espnEquipoId + '/schedule?fixture=' + (fixture ? 'true' : 'false')),
    avisos
  );

  var eventos = (res && res.events) || [];
  var partidos = [];

  for (var i = 0; i < eventos.length; i++) {
    var p = interpretarPartido_(eventos[i]);
    if (p) partidos.push(p);
  }

  partidos.sort(function (a, b) {
    return fixture
      ? (a.fechaISO || '').localeCompare(b.fechaISO || '')
      : (b.fechaISO || '').localeCompare(a.fechaISO || '');
  });

  return partidos;
}

/** Convierte un evento de ESPN al formato que pinta la interfaz. */
function interpretarPartido_(evento) {
  var comp = evento && evento.competitions && evento.competitions[0];
  if (!comp) return null;

  var yo = null;
  var rival = null;
  var competidores = comp.competitors || [];

  for (var i = 0; i < competidores.length; i++) {
    var equipoId = competidores[i].team && String(competidores[i].team.id);
    if (equipoId === String(CONFIG.espnEquipoId)) yo = competidores[i];
    else rival = competidores[i];
  }
  if (!yo || !rival) return null;

  var estado = (comp.status && comp.status.type) || {};
  var jugado = estado.completed === true;

  var gf = golesDe_(yo);
  var ga = golesDe_(rival);
  var resultado = '';
  if (jugado && gf !== null && ga !== null) {
    resultado = Number(gf) > Number(ga) ? 'G' : Number(gf) < Number(ga) ? 'P' : 'E';
  }

  var fecha = fechaLocalDesde_(evento.date || comp.date || '');

  return {
    rival: (rival.team && rival.team.displayName) || '',
    escudoRival: rival.team && rival.team.logos && rival.team.logos.length ? rival.team.logos[0].href : '',
    esLocal: yo.homeAway === 'home',
    fechaISO: aISO_(evento.date || comp.date || ''),
    fechaLocal: fecha.fecha,
    hora: fecha.hora,
    estadio: (comp.venue && comp.venue.fullName) || '',
    jornada: (evento.week && (evento.week.text || evento.week.number)) || '',
    jugado: jugado,
    golesNuestros: jugado ? gf : null,
    golesRival: jugado ? ga : null,
    resultado: resultado,
  };
}

function golesDe_(competidor) {
  if (!competidor || !competidor.score) return null;
  var s = competidor.score;
  if (s.displayValue !== undefined && s.displayValue !== '') return s.displayValue;
  if (s.value !== undefined && s.value !== null) return String(s.value);
  return null;
}

/**
 * Convierte la fecha UTC de ESPN a fecha y hora locales del club.
 *
 * Se usa un desfase fijo (CONFIG.desfaseHoras) en vez de Intl o Utilities:
 * así el mismo código da el mismo resultado en Apps Script y en Node, sin
 * depender de zonas horarias del entorno. México ya no aplica horario de
 * verano, así que UTC-6 es estable todo el año.
 */
function fechaLocalDesde_(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return { fecha: '', hora: '' };

  var local = new Date(d.getTime() + CONFIG.desfaseHoras * 3600000);
  var dos = function (n) {
    return (n < 10 ? '0' : '') + n;
  };

  return {
    fecha: local.getUTCFullYear() + '-' + dos(local.getUTCMonth() + 1) + '-' + dos(local.getUTCDate()),
    hora: dos(local.getUTCHours()) + ':' + dos(local.getUTCMinutes()),
  };
}

// ===========================================================================
// Contenido del club: videos del canal oficial de YouTube
//
// Se usa el feed público (Atom) del canal oficial. Es la vía legítima para
// mostrar contenido con jugadores: publica el club, no se raspan cuentas
// personales ni se tocan asuntos de familia.
// ===========================================================================

function recolectarVideos_(avisos) {
  if (!CONFIG.mostrarVideos || !CONFIG.youtubeCanalId) return [];

  var url =
    'https://www.youtube.com/feeds/videos.xml?channel_id=' + CONFIG.youtubeCanalId;
  var res = descargar_(url);

  if (!res.ok) {
    avisos.push('YouTube: ' + describirCodigo_(res.codigo));
    return [];
  }

  var videos = [];
  var re = /<entry>([\s\S]*?)<\/entry>/g;
  var m;

  while ((m = re.exec(res.texto)) !== null && videos.length < CONFIG.maxVideos) {
    var bloque = m[1];
    var id = limpiarTexto_(etiqueta_(bloque, 'yt:videoId'));
    var titulo = limpiarTexto_(etiqueta_(bloque, 'title'));
    if (!id || !titulo) continue;

    videos.push({
      id: id,
      titulo: titulo,
      enlace: 'https://www.youtube.com/watch?v=' + id,
      // La miniatura se arma con el id: no hace falta leer media:thumbnail.
      miniatura: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
      publicadoISO: aISO_(limpiarTexto_(etiqueta_(bloque, 'published'))),
      categoria: categorizarVideo_(titulo),
    });
  }

  return videos;
}

/** Etiqueta del video según el título, para dar contexto en la tarjeta. */
function categorizarVideo_(titulo) {
  var t = normalizar_(titulo);
  if (/femenil|femenina/.test(t)) return 'Femenil';
  if (/conferencia|prensa|declaracion|entrevista/.test(t)) return 'Conferencia';
  if (/entrenamiento|preparaci|previa|pre /.test(t)) return 'Entrenamiento';
  if (/resumen|goles|highlights|latido/.test(t)) return 'Resumen';
  if (/sub-?(17|18|20|23)|cantera|juvenil/.test(t)) return 'Cantera';
  return 'Del club';
}

// ===========================================================================
// Utilidades HTTP y de texto
// ===========================================================================

/**
 * Descarga una URL. Devuelve siempre un objeto:
 *   { ok: true,  texto: '...' }
 *   { ok: false, codigo: 403 }   (codigo 0 = fallo de red o timeout)
 */
function descargar_(url) {
  try {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      timeout: CONFIG.timeoutSegundos,
      headers: { 'User-Agent': CONFIG.userAgent, 'Accept-Language': 'es-MX,es;q=0.9' },
    });
    var codigo = res.getResponseCode();
    if (codigo !== 200) return { ok: false, codigo: codigo };
    return { ok: true, texto: res.getContentText() };
  } catch (err) {
    return { ok: false, codigo: 0 };
  }
}

/** Traduce el código HTTP a algo que se entienda leyendo el diagnóstico. */
function describirCodigo_(codigo) {
  if (codigo === 0) return 'sin conexión o tiempo agotado';
  if (codigo === 403) return 'HTTP 403 (acceso denegado: clave de API retirada o User-Agent bloqueado)';
  if (codigo === 404) return 'HTTP 404 (no encontrado)';
  if (codigo === 429) return 'HTTP 429 (demasiadas peticiones)';
  if (codigo >= 500) return 'HTTP ' + codigo + ' (fallo del servidor de origen)';
  return 'HTTP ' + codigo;
}

function pedirJson_(url, avisos) {
  var res = descargar_(url);
  if (!res.ok) {
    avisos.push(describirCodigo_(res.codigo) + ' en la fuente de datos: ' + rutaCorta_(url));
    return null;
  }
  try {
    return JSON.parse(res.texto);
  } catch (err) {
    avisos.push('La fuente de datos devolvió un JSON inválido: ' + rutaCorta_(url));
    return null;
  }
}

/** Última parte de la URL, para no llenar el diagnóstico de enlaces largos. */
function rutaCorta_(url) {
  var partes = String(url).split('/');
  return partes[partes.length - 1];
}

function etiqueta_(bloque, nombre) {
  var re = new RegExp('<' + nombre + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + nombre + '>');
  var m = bloque.match(re);
  return m ? m[1] : '';
}

var ENTIDADES_ = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  '#39': "'",
  '#8217': '\u2019',
  '#8216': '\u2018',
  '#8220': '\u201c',
  '#8221': '\u201d',
  '#8230': '\u2026',
  '#233': 'e',
  '#225': 'a',
  '#237': 'i',
  '#243': 'o',
  '#250': 'u',
  '#241': 'n',
};

function decodificarEntidades_(s) {
  return String(s).replace(/&(#?[0-9a-zA-Z]+);/g, function (todo, ent) {
    if (Object.prototype.hasOwnProperty.call(ENTIDADES_, ent)) return ENTIDADES_[ent];
    if (ent.charAt(0) === '#') {
      var hex = ent.charAt(1).toLowerCase() === 'x';
      var code = hex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!isNaN(code) && code > 0) {
        try {
          return String.fromCodePoint(code);
        } catch (err) {
          return todo;
        }
      }
    }
    return todo;
  });
}

function limpiarTexto_(s) {
  if (!s) return '';
  var out = String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  out = out.replace(/<[^>]*>/g, ' ');
  out = decodificarEntidades_(out);
  return out.replace(/\s+/g, ' ').trim();
}

function normalizar_(s) {
  var out = String(s || '').toLowerCase();
  if (out.normalize) out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return out
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aISO_(fecha) {
  if (!fecha) return '';
  var d = new Date(fecha);
  if (isNaN(d.getTime())) {
    // Algunos feeds usan "2026-10-05 23:00:00" sin zona horaria.
    d = new Date(String(fecha).replace(' ', 'T'));
  }
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

function claveTitulo_(titulo) {
  return normalizar_(titulo);
}

function bigramas_(texto) {
  var s = ' ' + claveTitulo_(texto) + ' ';
  var set = {};
  for (var i = 0; i < s.length - 1; i++) set[s.substr(i, 2)] = 1;
  return set;
}

/** Coeficiente de Dice sobre bigramas: 0 = nada en común, 1 = idénticos. */
function similitud_(a, b) {
  var ka = Object.keys(a);
  var kb = Object.keys(b);
  if (!ka.length || !kb.length) return 0;
  var inter = 0;
  for (var i = 0; i < ka.length; i++) if (b[ka[i]]) inter++;
  return (2 * inter) / (ka.length + kb.length);
}

function escaparRegex_(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
