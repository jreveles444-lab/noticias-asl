'use strict';
/**
 * gas-shim.js — Emula los servicios de Apps Script en Node para poder
 * ejecutar src/Code.gs sin subirlo a Google.
 *
 * Detalles importantes:
 *  - UrlFetchApp es SÍNCRONO en Apps Script. Aquí se emula con `curl` +
 *    execFileSync, que también es síncrono. Así el mismo Code.gs corre igual
 *    en ambos entornos, sin async/await (que Apps Script no soporta).
 *  - No hay dependencias externas: solo módulos nativos de Node.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const SRC = path.join(RAIZ, 'src');
const ARCHIVOS = ['Config.gs', 'Code.gs'];

let contadorTmp = 0;

// ---------------------------------------------------------------------------
// UrlFetchApp
// ---------------------------------------------------------------------------
function fetchSincrono(url, params) {
  params = params || {};
  const tmp = path.join(os.tmpdir(), 'asl-preview-' + process.pid + '-' + contadorTmp++ + '.tmp');
  const timeout = String(params.timeout || 30);

  const args = ['-sL', '--max-time', timeout, '-o', tmp, '-w', '%{http_code}'];
  const cabeceras = params.headers || {};
  if (cabeceras['User-Agent']) args.push('-A', cabeceras['User-Agent']);
  if (cabeceras['Accept-Language']) args.push('-H', 'Accept-Language: ' + cabeceras['Accept-Language']);
  args.push(url);

  let codigo = 0;
  try {
    const salida = execFileSync('curl', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    codigo = parseInt(String(salida).trim().split('\n').pop(), 10) || 0;
  } catch (err) {
    codigo = 0; // 0 = fallo de red, igual que un error de UrlFetchApp
  }

  let cuerpo = '';
  try {
    cuerpo = fs.readFileSync(tmp, 'utf8');
  } catch (err) {
    cuerpo = '';
  }
  try {
    fs.unlinkSync(tmp);
  } catch (err) {
    /* nada */
  }

  return {
    codigo: codigo,
    cuerpo: cuerpo,
    getResponseCode() {
      return this.codigo;
    },
    getContentText() {
      return this.cuerpo;
    },
    getHeaders() {
      return {};
    },
  };
}

// ---------------------------------------------------------------------------
// Emulación del saneado de HTML que hace Apps Script
//
// Comprobado contra una implementación real: Apps Script elimina los
// comentarios /* ... */ y // de los bloques <script>, y los /* ... */ de los
// <style>. Lo que está dentro de una cadena ('...', "...", `...`) se respeta.
//
// Por eso un marcador de plantilla NUNCA debe ir dentro de un comentario.
// ---------------------------------------------------------------------------
function quitarComentarios(texto, permitirLinea) {
  let salida = '';
  let i = 0;
  let comilla = null;

  while (i < texto.length) {
    const c = texto.charAt(i);
    const d = texto.charAt(i + 1);

    if (comilla) {
      salida += c;
      if (c === '\\') {
        salida += d;
        i += 2;
        continue;
      }
      if (c === comilla) comilla = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      comilla = c;
      salida += c;
      i += 1;
      continue;
    }

    if (c === '/' && d === '*') {
      const fin = texto.indexOf('*/', i + 2);
      i = fin === -1 ? texto.length : fin + 2;
      salida += ' ';
      continue;
    }

    if (permitirLinea && c === '/' && d === '/') {
      const salto = texto.indexOf('\n', i);
      i = salto === -1 ? texto.length : salto;
      continue;
    }

    salida += c;
    i += 1;
  }

  return salida;
}

function sanearComoAppsScript(html) {
  return html.replace(
    /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi,
    function (todo, etiqueta, attrs, cuerpo) {
      const esDatos = /type\s*=\s*["']?[^"'>\s]*json/i.test(attrs);
      if (esDatos) return todo;

      const limpio =
        etiqueta.toLowerCase() === 'style'
          ? quitarComentarios(cuerpo, false)
          : quitarComentarios(cuerpo, true);

      return '<' + etiqueta + attrs + '>' + limpio + '</' + etiqueta + '>';
    }
  );
}

// ---------------------------------------------------------------------------
// Resto de servicios
// ---------------------------------------------------------------------------
function crearServicios() {
  const cache = new Map();
  const props = new Map();

  const salidaHtml = function (contenido) {
    return {
      _contenido: contenido == null ? '' : String(contenido),
      getContent() {
        return this._contenido;
      },
      setTitle() {
        return this;
      },
      setFaviconUrl() {
        return this;
      },
      setWidth() {
        return this;
      },
      setHeight() {
        return this;
      },
      setXFrameOptionsMode() {
        return this;
      },
    };
  };

  return {
    UrlFetchApp: { fetch: fetchSincrono },

    CacheService: {
      getScriptCache() {
        return {
          get(clave) {
            const entrada = cache.get(clave);
            if (!entrada) return null;
            if (entrada.expira && entrada.expira < Date.now()) {
              cache.delete(clave);
              return null;
            }
            return entrada.valor;
          },
          put(clave, valor, segundos) {
            cache.set(clave, { valor: valor, expira: Date.now() + (segundos || 600) * 1000 });
          },
          remove(clave) {
            cache.delete(clave);
          },
        };
      },
      getDocumentCache() {
        return this.getScriptCache();
      },
      getUserCache() {
        return this.getScriptCache();
      },
    },

    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty: (k) => (props.has(k) ? props.get(k) : null),
          setProperty: (k, v) => props.set(k, String(v)),
          deleteProperty: (k) => props.delete(k),
          getProperties: () => Object.fromEntries(props),
        };
      },
    },

    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL', DEFAULT: 'DEFAULT' },
      createHtmlOutputFromFile(nombre) {
        const crudo = fs.readFileSync(path.join(SRC, nombre + '.html'), 'utf8');
        // Apps Script NO sirve el HTML tal cual: le borra los comentarios.
        // Se emula aquí para que el preview detecte fallos como un marcador
        // puesto dentro de /* ... */.
        return salidaHtml(sanearComoAppsScript(crudo));
      },
      createHtmlOutput(contenido) {
        return salidaHtml(contenido);
      },
      createTemplateFromFile() {
        throw new Error(
          'El preview local no soporta plantillas HtmlService (<?= ?>). Usa createHtmlOutputFromFile + reemplazo de marcadores.'
        );
      },
    },

    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => {} }) }) }),
    },

    Logger: { log: (...a) => console.log('[Logger]', ...a) },
    console: console,
  };
}

// ---------------------------------------------------------------------------
// Carga de Config.gs + Code.gs en un contexto aislado
// ---------------------------------------------------------------------------
function cargarProyecto() {
  const servicios = crearServicios();
  const contexto = vm.createContext(servicios);

  for (const archivo of ARCHIVOS) {
    const ruta = path.join(SRC, archivo);
    const codigo = fs.readFileSync(ruta, 'utf8');
    try {
      vm.runInContext(codigo, contexto, { filename: ruta });
    } catch (err) {
      throw new Error('Error al cargar ' + archivo + ': ' + err.message);
    }
  }

  return {
    contexto,
    servicios,
    doGet: (e) => vm.runInContext('doGet', contexto)(e || {}),
    getDatos: () => vm.runInContext('getDatos', contexto)(),
  };
}

module.exports = { cargarProyecto, sanearComoAppsScript, RAIZ, SRC };
