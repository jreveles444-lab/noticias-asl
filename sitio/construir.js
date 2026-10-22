'use strict';
/**
 * construir.js — Genera el sitio estático en dist/ listo para publicar en
 * GitHub Pages, Netlify, Vercel, Cloudflare Pages o cualquier hosting de
 * archivos.
 *
 *   npm run sitio
 *   node sitio/construir.js --permitir-vacio
 *
 * Reutiliza el MISMO motor que la versión de Apps Script (src/Config.gs y
 * src/Code.gs) a través del emulador local, así que no hay dos copias de la
 * lógica de noticias que puedan desincronizarse.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const { cargarProyecto, RAIZ } = require('../local/gas-shim');
const { exigirPaginaValida } = require('../local/validar');

const DIST = path.join(RAIZ, 'dist');
const MINIMO_NOTICIAS = 5;

function kb(texto) {
  return (Buffer.byteLength(texto, 'utf8') / 1024).toFixed(1) + ' KB';
}

function comprobarCurl() {
  try {
    execFileSync('curl', ['--version'], { stdio: 'ignore' });
    return true;
  } catch (err) {
    return false;
  }
}

function robots() {
  return ['User-agent: *', 'Allow: /', ''].join('\n');
}

function pagina404(equipo) {
  return `<!DOCTYPE html>
<html lang="es-MX">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Página no encontrada · Noticias</title>
<style>
  html,body{margin:0;height:100%}
  body{background:#0d1117;color:#e6edf3;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
       display:flex;align-items:center;justify-content:center;text-align:center;padding:24px}
  h1{font-size:clamp(22px,4vw,34px);margin:0 0 10px}
  p{color:#9aa7b4;margin:0 0 22px}
  a{display:inline-block;background:#c8102e;color:#fff;text-decoration:none;font-weight:600;
    padding:12px 26px;border-radius:10px}
</style>
</head>
<body>
  <main>
    <h1>Esta página no existe</h1>
    <p>Las noticias de ${equipo} están en la portada.</p>
    <a href="/">Ir a las noticias</a>
  </main>
</body>
</html>
`;
}

function main() {
  const permitirVacio = process.argv.includes('--permitir-vacio');
  const arranque = Date.now();

  console.log('→ Generando el sitio estático…\n');

  if (!comprobarCurl()) {
    console.error('✖ No se encontró `curl`. Es necesario para descargar las fuentes.');
    process.exit(1);
  }

  const proyecto = cargarProyecto();

  let html;
  try {
    html = proyecto.doGet({}).getContent();
    // Lanza si el marcador o el JSON inyectado no son válidos.
    exigirPaginaValida(html);
  } catch (err) {
    console.error('✖ ' + err.message);
    process.exit(1);
  }

  const datos = proyecto.getDatos();
  const noticias = datos.noticias || [];

  // Nunca publicar una portada vacía (por ejemplo, si un cron corre y todas
  // las fuentes fallan a la vez): es mejor que el job falle y avise.
  if (noticias.length < MINIMO_NOTICIAS && !permitirVacio) {
    console.error(
      '✖ Solo se obtuvieron ' + noticias.length + ' noticias (mínimo ' + MINIMO_NOTICIAS + ').\n' +
        '  No se publica una portada vacía. Revisa el diagnóstico:\n' +
        (datos.avisos || []).map((a) => '   · ' + a).join('\n')
    );
    process.exit(1);
  }

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  fs.writeFileSync(path.join(DIST, 'index.html'), html, 'utf8');
  fs.writeFileSync(path.join(DIST, 'datos.json'), JSON.stringify(datos, null, 2), 'utf8');
  fs.writeFileSync(path.join(DIST, 'robots.txt'), robots(), 'utf8');
  fs.writeFileSync(path.join(DIST, '404.html'), pagina404(datos.equipo.nombre), 'utf8');
  // Sin .nojekyll, GitHub Pages procesa con Jekyll y puede ignorar archivos.
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '', 'utf8');

  const segundos = ((Date.now() - arranque) / 1000).toFixed(1);

  console.log('EQUIPO     ' + datos.equipo.nombre + '  (' + datos.equipo.liga + ')');
  console.log('NOTICIAS   ' + noticias.length + ' · ' + datos.totalFuentes + ' medios');
  console.log('TABLA      ' + (datos.tabla || []).length + ' filas · temporada ' + (datos.temporada || 'n/d'));
  console.log('PRÓXIMO    ' + (datos.proximo ? datos.proximo.rival : 'n/d'));
  console.log('ÚLTIMO     ' + (datos.ultimo ? datos.ultimo.rival : 'n/d'));
  console.log('TIEMPO     ' + segundos + ' s');
  console.log('');
  console.log('Archivos generados en dist/:');
  fs.readdirSync(DIST).sort().forEach((f) => {
    const p = path.join(DIST, f);
    const tam = fs.statSync(p).size;
    console.log('  ' + (f + ' '.repeat(Math.max(1, 16 - f.length))) + (tam / 1024).toFixed(1) + ' KB');
  });

  if ((datos.avisos || []).length) {
    console.log('\nAvisos de fuentes:');
    datos.avisos.forEach((a) => console.log('  ! ' + a));
  }

  console.log('\n✔ Listo. Ábrelo con:  open dist/index.html');
  console.log('  La página no tiene ningún tope de ancho: ocupa el 100% de la ventana.');
}

main();
