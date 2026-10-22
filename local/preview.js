'use strict';
/**
 * preview.js — Ejecuta el motor real (src/Code.gs) en local y genera
 * preview/index.html, exactamente el mismo HTML que servirá Apps Script.
 *
 *   npm run preview        (o: node local/preview.js)
 *   node local/preview.js --sin-cache
 */

const fs = require('fs');
const path = require('path');
const { cargarProyecto, RAIZ } = require('./gas-shim');
const { revisarMarcador, revisarJson } = require('./validar');

const DESTINO = path.join(RAIZ, 'preview');

function kb(texto) {
  return (Buffer.byteLength(texto, 'utf8') / 1024).toFixed(1) + ' KB';
}

function main() {
  const arranque = Date.now();
  console.log('→ Ejecutando el motor de Apps Script en local…\n');

  const fallosMarcador = revisarMarcador();
  if (fallosMarcador.length) {
    console.error('✖ Comprobación de plantilla fallida:');
    fallosMarcador.forEach((f) => console.error('   · ' + f));
    process.exit(1);
  }

  const proyecto = cargarProyecto();

  let html;
  try {
    html = proyecto.doGet({}).getContent();
  } catch (err) {
    console.error('✖ El motor falló: ' + err.message);
    console.error(err.stack);
    process.exit(1);
  }

  if (html.indexOf('/*__NEWS_DATA__*/null') !== -1) {
    console.error('✖ El marcador /*__NEWS_DATA__*/null no fue reemplazado. Revisa doGet().');
    process.exit(1);
  }

  fs.mkdirSync(DESTINO, { recursive: true });
  fs.writeFileSync(path.join(DESTINO, 'index.html'), html, 'utf8');

  // El navegador hará JSON.parse sobre este bloque: se comprueba aquí mismo.
  const revision = revisarJson(html);
  if (revision.fallos.length) {
    console.error('✖ El HTML generado no serviría:');
    revision.fallos.forEach((f) => console.error('   · ' + f));
    process.exit(1);
  }

  // Datos crudos, útiles para depurar sin abrir el navegador.
  const datos = proyecto.getDatos();
  fs.writeFileSync(path.join(DESTINO, 'datos.json'), JSON.stringify(datos, null, 2), 'utf8');

  // ---- Informe en consola ------------------------------------------------
  const noticias = datos.noticias || [];
  const segundos = ((Date.now() - arranque) / 1000).toFixed(1);

  console.log('EQUIPO     ' + datos.equipo.nombre + '  (' + datos.equipo.liga + ')');
  console.log('NOTICIAS   ' + noticias.length + ' tras deduplicar · ' + datos.totalFuentes + ' medios distintos');
  console.log('TABLA      ' + (datos.tabla || []).length + ' filas · temporada ' + (datos.temporada || 'n/d'));
  console.log('PRÓXIMO    ' + (datos.proximo ? (datos.proximo.esLocal ? 'vs ' : 'en casa de ') + datos.proximo.rival + ' — ' + datos.proximo.fechaISO : 'n/d'));
  console.log('ÚLTIMO     ' + (datos.ultimo
    ? datos.ultimo.resultado + ' ' + datos.ultimo.golesNuestros + '-' + datos.ultimo.golesRival + ' vs ' + datos.ultimo.rival
    : 'n/d'));
  console.log('PARTIDOS   ' + (datos.proximos || []).length + ' próximos · ' + (datos.ultimos || []).length + ' resultados');
  console.log('TIEMPO     ' + segundos + ' s   ·   HTML ' + kb(html));
  console.log('PLANTILLA  marcador sobrevive al saneado de Apps Script ✓   JSON inyectado válido ✓');
  console.log('');

  const porCategoria = {};
  noticias.forEach((n) => (n.categorias || []).forEach((c) => (porCategoria[c] = (porCategoria[c] || 0) + 1)));
  console.log('CATEGORÍAS ' + JSON.stringify(porCategoria));

  const conDuplicados = noticias.filter((n) => (n.tambienEn || []).length);
  console.log('CRUZADAS   ' + conDuplicados.length + ' noticias publicadas en varios medios');

  console.log('\n--- Primeros 8 titulares ---');
  noticias.slice(0, 8).forEach((n) => {
    console.log('  • [' + n.fuente + '] ' + n.titulo.slice(0, 88));
  });

  if ((datos.avisos || []).length) {
    console.log('\n--- Avisos ---');
    datos.avisos.forEach((a) => console.log('  ! ' + a));
  }

  console.log('\n✔ Listo: ' + path.join('preview', 'index.html'));
  console.log('  Ábrelo con:  open preview/index.html');
}

main();
