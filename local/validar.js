'use strict';
/**
 * validar.js — Comprobaciones compartidas entre el preview local y el
 * generador del sitio estático.
 *
 * Existen por un fallo real: el marcador de plantilla estaba dentro de un
 * comentario de JavaScript y Apps Script lo borraba al servir el HTML, así que
 * el preview local pasaba y el sitio publicado se quedaba vacío. Estas dos
 * comprobaciones habrían detenido la publicación.
 */

const fs = require('fs');
const path = require('path');
const { sanearComoAppsScript, SRC } = require('./gas-shim');

const MARCADOR = '__DATOS_JSON__';
const RE_BLOQUE = /<script[^>]*id="datos-ads"[^>]*>([\s\S]*?)<\/script>/i;

function extraerBloque(texto) {
  const m = RE_BLOQUE.exec(texto);
  return m ? m[1].trim() : null;
}

/**
 * El marcador debe existir en el bloque de datos y sobrevivir al saneado de
 * HTML de Apps Script (que elimina comentarios).
 */
function revisarMarcador() {
  const crudo = fs.readFileSync(path.join(SRC, 'Index.html'), 'utf8');
  const saneado = sanearComoAppsScript(crudo);
  const fallos = [];

  const enCrudo = extraerBloque(crudo);

  if (enCrudo === null) {
    fallos.push(
      'No existe el bloque <script type="application/json" id="datos-ads"> en Index.html: no hay dónde inyectar los datos.'
    );
    return fallos;
  }
  if (enCrudo !== MARCADOR) {
    fallos.push(
      'El bloque de datos debe contener exactamente ' +
        MARCADOR +
        ', pero contiene: ' +
        JSON.stringify(enCrudo.slice(0, 60))
    );
  }

  const enSaneado = extraerBloque(saneado);
  if (enSaneado === null) {
    fallos.push('Apps Script eliminaría el bloque de datos completo al sanear el HTML.');
  } else if (enSaneado !== MARCADOR) {
    fallos.push(
      'Apps Script modificaría el marcador al servir el HTML (queda como ' +
        JSON.stringify(enSaneado.slice(0, 60)) +
        '). El marcador va en el TEXTO del bloque, nunca dentro de un comentario /* */ ni //.'
    );
  }

  return fallos;
}

/** El JSON inyectado debe ser parseable, igual que hará el navegador. */
function revisarJson(html) {
  const texto = extraerBloque(html);

  if (texto === null) {
    return { fallos: ['No se encontró el bloque <script id="datos-ads"> en el HTML generado.'], datos: null };
  }
  if (texto === MARCADOR) {
    return { fallos: ['El marcador no fue reemplazado: la página se serviría vacía.'], datos: null };
  }

  try {
    return { fallos: [], datos: JSON.parse(texto) };
  } catch (err) {
    return { fallos: ['El JSON inyectado no es válido: ' + err.message], datos: null };
  }
}

/** Lanza un error legible si alguna comprobación falla. */
function exigirPaginaValida(html) {
  const fallos = revisarMarcador().concat(revisarJson(html).fallos);
  if (fallos.length) {
    throw new Error('Página inválida:\n  · ' + fallos.join('\n  · '));
  }
}

module.exports = { MARCADOR, revisarMarcador, revisarJson, exigirPaginaValida };
