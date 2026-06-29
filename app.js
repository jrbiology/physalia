// =============================================================
// app.js — Physalia Citizen Science Radar
// =============================================================
//
// Flow: Welcome carousel → Register form → Thank-you screen → Register again.
//
// To adapt to a different species:
//   · Replace SUPABASE_URL and SUPABASE_KEY (section 1).
//   · Change default map centre coordinates (sections 9 and 12).
//   · Update database column names in section 11 if needed.
// =============================================================


// -------------------------------------------------------------
// 1. CONFIGURATION
// -------------------------------------------------------------
const SUPABASE_URL = 'https://pssmplbphbdflxaynwfy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gqhqYeYe3SnNKdp7ZujU5w_AfZu5YdI';


// -------------------------------------------------------------
// 2. GLOBAL STATE
// -------------------------------------------------------------
let db             = null;
let miLat          = null;  // Current GPS latitude
let miLng          = null;  // Current GPS longitude
let ultimoLat      = null;  // Coordinates of the last submitted sighting
let ultimoLng      = null;
let ubicacion      = '';    // 'arena' | 'agua'
let fotosFiles     = [null, null, null];
let intentado      = false; // True after first submit attempt without photos
let enviando       = false;
let errorTimer     = null;
let mapaRegistro       = null;
let mapaAgradecimiento = null;
let marcadorUsuario    = null;
let capasAg            = [];  // All layers on the thank-you map (for cleanup)


// -------------------------------------------------------------
// 3. ANIMATED BACKGROUND BUBBLES
// Runs immediately — the script is at the end of <body> so the
// #bubbles element already exists in the DOM.
// -------------------------------------------------------------
(function () {
  const wrap = document.getElementById('bubbles');
  if (!wrap) return;
  const conf = [
    [8, 10, 14, 0], [20, 6, 11, 2], [33, 14, 17, 1], [47, 8, 13, 4],
    [60, 11, 16, 3], [72, 5, 10, 5], [84, 13, 18, 1.5], [92, 7, 12, 6],
  ];
  wrap.innerHTML = conf.map(([l, sz, dur, delay]) =>
    `<span style="left:${l}%;width:${sz}px;height:${sz}px;animation-duration:${dur}s;animation-delay:${delay}s;"></span>`
  ).join('');
})();


// -------------------------------------------------------------
// 4. CAROUSEL
// Touch-swipe and dot-click navigation for the welcome slides.
// -------------------------------------------------------------
(function () {
  const track    = document.getElementById('paTrack');
  const dotsWrap = document.getElementById('paDots');
  const carousel = document.getElementById('paCarousel');
  if (!track || !dotsWrap || !carousel) return;

  const total = track.children.length;
  let actual = 0;
  let touchX = null;

  // Build dot buttons
  for (let i = 0; i < total; i++) {
    const b = document.createElement('button');
    b.className = 'pa-dot' + (i === 0 ? ' is-active' : '');
    b.setAttribute('aria-label', 'Ir a la página ' + (i + 1));
    b.addEventListener('click', () => irSlide(i));
    dotsWrap.appendChild(b);
  }

  function irSlide(i) {
    actual = Math.max(0, Math.min(total - 1, i));
    track.style.transform = 'translateX(-' + (actual * 100) + '%)';
    [...dotsWrap.children].forEach((d, idx) => d.classList.toggle('is-active', idx === actual));
  }

  carousel.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  carousel.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) irSlide(actual + (dx < 0 ? 1 : -1));
    touchX = null;
  });
})();


// -------------------------------------------------------------
// 5. INIT
// Wait for both Supabase and Leaflet CDN scripts to be ready
// before initialising (CDNs load asynchronously).
// -------------------------------------------------------------
window.addEventListener('load', ensureLibs);

function ensureLibs() {
  if (window.supabase && window.L) init();
  else setTimeout(ensureLibs, 120);
}

function init() {
  try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }
  catch (e) { console.log('Supabase init error:', e); }
  cargarContadorCabecera();
  obtenerGPS();
  configurarFotos();
  document.getElementById('fechaAvistamiento').addEventListener('keydown', e => e.preventDefault());
}


// -------------------------------------------------------------
// 6. NAVIGATION
// -------------------------------------------------------------
function mostrarPantalla(nombre) {
  document.querySelectorAll('section.screen').forEach(s =>
    s.classList.toggle('is-active', s.dataset.screen === nombre)
  );
}

function irBienvenida() {
  mostrarPantalla('bienvenida');
}

function irRegistrar() {
  mostrarPantalla('registrar');
  nuevoRegistro();
  // Brief delay lets the section become visible before the map renders,
  // preventing a common Leaflet sizing bug on hidden elements.
  setTimeout(() => {
    if (!navigator.geolocation) { iniciarMapaRegistro(); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        miLat = p.coords.latitude;
        miLng = p.coords.longitude;
        setGps('Ubicación obtenida', 'ok');
        mostrarCoordenadas(miLat, miLng);
        iniciarMapaRegistro();
      },
      () => {
        setGps('GPS no disponible — toca el mapa para indicar la ubicación', 'err');
        iniciarMapaRegistro();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, 80);
}

function irAgradecimiento() {
  mostrarPantalla('agradecimiento');
  cargarContadoresTab();
  setTimeout(iniciarMapaAgradecimiento, 320);
}


// -------------------------------------------------------------
// 7. GPS
// -------------------------------------------------------------
function setGps(texto, estado) {
  document.getElementById('gpsTxt').textContent = texto;
  const dot = document.getElementById('gpsDot');
  // Map semantic state names to CSS class names
  const clases = { ok: 'ok', buscando: 'searching', searching: 'searching', err: 'err' };
  dot.className = 'gps__dot ' + (clases[estado] || estado);
}

function obtenerGPS() {
  if (!navigator.geolocation) { setGps('Tu navegador no soporta GPS', 'err'); return; }
  setGps('Obteniendo ubicación...', 'searching');
  navigator.geolocation.getCurrentPosition(
    (p) => {
      miLat = p.coords.latitude;
      miLng = p.coords.longitude;
      setGps('Ubicación obtenida', 'ok');
      mostrarCoordenadas(miLat, miLng);
      if (mapaRegistro) actualizarMapaConPosicion(miLat, miLng);
    },
    (error) => {
      let msg = 'Toca el mapa para indicar la ubicación';
      if (error.code === 1) msg = 'Permiso denegado — toca el mapa para indicar la ubicación';
      if (error.code === 2) msg = 'GPS no disponible — toca el mapa para indicar la ubicación';
      if (error.code === 3) msg = 'Tiempo agotado — toca el mapa para indicar la ubicación';
      setGps(msg, 'err');
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function mostrarCoordenadas(lat, lng) {
  const el = document.getElementById('gpsCoords');
  el.style.display = 'block';
  el.textContent =
    Math.abs(lat).toFixed(5) + ' ' + (lat >= 0 ? 'N' : 'S') + ',  ' +
    Math.abs(lng).toFixed(5) + ' ' + (lng >= 0 ? 'E' : 'W');
}


// -------------------------------------------------------------
// 8. DATE SELECTOR
// dias=0 → today, dias=1 → yesterday, dias=-1 → show date picker
// -------------------------------------------------------------
function seleccionarFecha(dias) {
  document.querySelectorAll('.fecha-btn').forEach(b => b.classList.remove('is-active'));
  document.querySelector(`.fecha-btn[data-dias="${dias}"]`).classList.add('is-active');

  const input = document.getElementById('fechaAvistamiento');
  if (dias === -1) {
    input.style.display = 'block';
    input.focus();
  } else {
    input.style.display = 'none';
    const d = new Date();
    d.setDate(d.getDate() - dias);
    input.value = d.toISOString().split('T')[0];
  }
}


// -------------------------------------------------------------
// 9. HABITAT SELECTOR
// -------------------------------------------------------------
function seleccionar(valor) {
  ubicacion = valor;
  document.querySelectorAll('.hbtn').forEach(b => {
    b.classList.remove('sel-arena', 'sel-agua');
    if (b.dataset.hab === valor) b.classList.add('sel-' + valor);
  });
}


// -------------------------------------------------------------
// 10. REGISTRATION MAP
// Destroyed and recreated each time the register screen opens
// to avoid Leaflet's "container already initialised" error.
// -------------------------------------------------------------
function iniciarMapaRegistro() {
  const L = window.L;
  if (!L || !document.getElementById('mapa')) return;
  if (mapaRegistro) { mapaRegistro.remove(); mapaRegistro = null; marcadorUsuario = null; }

  mapaRegistro = L.map('mapa').setView([43.626177, -5.876991], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap' }).addTo(mapaRegistro);

  mapaRegistro.on('click', (e) => {
    miLat = e.latlng.lat;
    miLng = e.latlng.lng;
    colocarMarcadorRegistro(miLat, miLng);
    setGps('Ubicación seleccionada manualmente', 'ok');
    mostrarCoordenadas(miLat, miLng);
  });

  setTimeout(() => { if (mapaRegistro) mapaRegistro.invalidateSize(); }, 120);
  if (miLat && miLng) actualizarMapaConPosicion(miLat, miLng);
}

function colocarMarcadorRegistro(lat, lng) {
  const L = window.L;
  if (!mapaRegistro) return;
  if (marcadorUsuario) { mapaRegistro.removeLayer(marcadorUsuario); marcadorUsuario = null; }

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e84a7f';
  const iconoPin = L.divIcon({
    className: '',
    html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="29" height="47">' +
          '<path fill="' + accent + '" stroke="#ffffff" stroke-width="1.5" ' +
          'd="M12.5 0C5.6 0 0 5.6 0 12.5c0 8.3 12.5 28.5 12.5 28.5S25 20.8 25 12.5C25 5.6 19.4 0 12.5 0z"/>' +
          '<circle fill="white" cx="12.5" cy="12.5" r="4.5"/></svg>',
    iconSize: [29, 47], iconAnchor: [14, 47], popupAnchor: [1, -38],
  });

  marcadorUsuario = L.marker([lat, lng], { draggable: true, icon: iconoPin }).addTo(mapaRegistro);
  marcadorUsuario.bindTooltip('Arrastra para ajustar', { permanent: false, direction: 'top', offset: [0, -12] });
  marcadorUsuario.on('dragend', () => {
    const pos = marcadorUsuario.getLatLng();
    miLat = pos.lat; miLng = pos.lng;
    setGps('Posición ajustada', 'ok');
    mostrarCoordenadas(miLat, miLng);
  });
}

function actualizarMapaConPosicion(lat, lng) {
  if (!mapaRegistro) return;
  mapaRegistro.setView([lat, lng], 15);
  colocarMarcadorRegistro(lat, lng);
}


// -------------------------------------------------------------
// 10. PHOTO HANDLING
// EXIF metadata (including embedded GPS) is stripped by redrawing
// the image on a canvas before upload — the canvas API never
// copies EXIF, so the output blob is always metadata-free.
// -------------------------------------------------------------
function configurarFotos() {
  document.querySelectorAll('#photos .slot').forEach(slot => {
    const i     = parseInt(slot.dataset.i, 10);
    const input = slot.querySelector('input[type=file]');
    slot.addEventListener('click', (e) => {
      if (e.target.classList.contains('slot__del')) return;
      if (!slot.classList.contains('disabled')) input.click();
    });
    input.addEventListener('change', (e) => onFotoChange(e, i));
  });
}

function onFotoChange(e, i) {
  const fichero = e.target.files[0];
  if (!fichero) return;
  if (!fichero.type.startsWith('image/')) { mostrarError('Por favor selecciona solo imágenes'); return; }
  fotosFiles[i] = fichero;
  pintarSlots();
  ocultarAviso();
  setSubmitLabel('Enviar avistamiento');
  intentado = false;
}

function borrarFoto(i) {
  // Removing slot i also clears subsequent slots to keep the sequence contiguous
  for (let j = i; j < 3; j++) fotosFiles[j] = null;
  pintarSlots();
}

function pintarSlots() {
  document.querySelectorAll('#photos .slot').forEach(slot => {
    const i     = parseInt(slot.dataset.i, 10);
    const input = slot.querySelector('input[type=file]');
    const disabled = i > 0 && !fotosFiles[i - 1];
    slot.classList.toggle('disabled', disabled);
    slot.querySelectorAll('img, .slot__del').forEach(el => el.remove());
    const cam = slot.querySelector('.cam');
    if (fotosFiles[i]) {
      if (cam) cam.style.display = 'none';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(fotosFiles[i]);
      const del = document.createElement('button');
      del.className = 'slot__del';
      del.textContent = '✕';
      del.addEventListener('click', (e) => { e.stopPropagation(); borrarFoto(i); });
      slot.appendChild(img);
      slot.appendChild(del);
    } else if (cam) {
      cam.style.display = '';
    }
    input.value = '';
  });
}

function stripMetadatosYRedimensionar(fichero) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichero);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 2048;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('No se pudo procesar la imagen')); return; }
        resolve(blob);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}


// -------------------------------------------------------------
// 11. SUBMIT
// First press without photos shows a soft warning; second press
// confirms sending without photos.
// -------------------------------------------------------------
function setSubmitLabel(txt) { document.getElementById('submitBtn').textContent = txt; }
function mostrarAviso()      { document.getElementById('aviso').style.display = 'block'; }
function ocultarAviso()      { document.getElementById('aviso').style.display = 'none'; }

async function enviar() {
  if (enviando) return;
  if (!miLat || !miLng) {
    mostrarError('Indica la ubicación: toca el mapa para colocar el marcador.');
    return;
  }
  if (!ubicacion) {
    mostrarError('Por favor indica si la carabela está en el agua o en la arena.');
    return;
  }

  const hayFoto = fotosFiles.some(f => f !== null);
  if (!hayFoto && !intentado) {
    setSubmitLabel('Enviar sin fotos');
    intentado = true;
    mostrarAviso();
    return;
  }

  enviando = true;
  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const fotosUrls = [null, null, null];
    for (let i = 0; i < 3; i++) {
      if (fotosFiles[i]) {
        const blob      = await stripMetadatosYRedimensionar(fotosFiles[i]);
        const nombre    = 'avistamiento_' + Date.now() + '_' + i + '.jpg';
        const { error: errFoto } = await db.storage.from('fotos').upload(nombre, blob, { contentType: 'image/jpeg' });
        if (errFoto) throw new Error('Error subiendo foto: ' + errFoto.message);
        const { data: urlData } = db.storage.from('fotos').getPublicUrl(nombre);
        fotosUrls[i] = urlData.publicUrl;
      }
    }

    const numEspecimenes = parseInt(document.getElementById('numEspecimenes').value, 10);
    const { error: errDB } = await db.from('avistamientos').insert({
      latitud:            miLat,
      longitud:           miLng,
      comentario:         document.getElementById('comentario').value,
      num_especimenes:    isNaN(numEspecimenes) ? null : numEspecimenes,
      foto_url:           fotosUrls[0],
      foto_url2:          fotosUrls[1],
      foto_url3:          fotosUrls[2],
      ubicacion_carabela:  ubicacion,
      fecha_avistamiento:  document.getElementById('fechaAvistamiento').value || null,
      verificado:          false,
    });
    if (errDB) throw new Error('Error guardando datos: ' + errDB.message);

    ultimoLat = miLat;
    ultimoLng = miLng;
    irAgradecimiento();

  } catch (error) {
    mostrarError('Error al enviar: ' + error.message);
    enviando = false;
    btn.disabled = false;
    btn.textContent = 'Enviar avistamiento';
  }
}


// -------------------------------------------------------------
// 12. THANK-YOU MAP
// -------------------------------------------------------------
async function iniciarMapaAgradecimiento() {
  const L = window.L;
  if (!L || !document.getElementById('mapa-agradecimiento')) return;

  if (mapaAgradecimiento) {
    mapaAgradecimiento.invalidateSize();
    limpiarCapasAg();
    await cargarPuntosEnMapa(mapaAgradecimiento);
    anadirMarcadorPropio(mapaAgradecimiento);
    return;
  }

  mapaAgradecimiento = L.map('mapa-agradecimiento').setView([43.37, -5.86], 8);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap' }).addTo(mapaAgradecimiento);
  await cargarPuntosEnMapa(mapaAgradecimiento);
  anadirMarcadorPropio(mapaAgradecimiento);
}

function anadirMarcadorPropio(mapa) {
  const L = window.L;
  if (!ultimoLat || !ultimoLng) return;
  const accent  = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e84a7f';
  const marcador = L.circleMarker([ultimoLat, ultimoLng], {
    radius: 11, fillColor: accent, color: '#fff', weight: 2.5, opacity: 1, fillOpacity: 0.95,
  }).addTo(mapa);
  capasAg.push(marcador);
}

function limpiarCapasAg() {
  capasAg.forEach(c => { if (mapaAgradecimiento) mapaAgradecimiento.removeLayer(c); });
  capasAg = [];
}

async function cargarPuntosEnMapa(mapa) {
  const L = window.L;
  try {
    const { data: avistamientos } = await db
      .from('avistamientos')
      .select('*')
      .order('created_at', { ascending: false });

    if (!avistamientos || avistamientos.length === 0) return;

    avistamientos.forEach((a) => {
      const marcador = L.circleMarker([a.latitud, a.longitud], {
        radius:      8,
        fillColor:   a.verificado ? '#0a9d92' : '#8a9aa0',
        color:       a.verificado ? '#076b63' : '#6b7478',
        weight:      2,
        opacity:     1,
        fillOpacity: 0.85,
        interactive: a.verificado,
      }).addTo(mapa);
      capasAg.push(marcador);

      if (a.verificado) {
        const fecha = new Date(a.created_at).toLocaleDateString('es-ES');
        const fotos = [a.foto_url, a.foto_url2, a.foto_url3].filter(f => f)
          .map(f => '<img src="' + f + '" style="width:60px;height:60px;object-fit:cover;border-radius:8px;">').join('');
        marcador.bindPopup(
          '<div style="max-width:220px">' +
          (fotos ? '<div style="display:flex;gap:4px;margin-bottom:6px">' + fotos + '</div>' : '') +
          '<div style="font-size:0.78rem;color:rgba(10,59,80,0.6)">' + fecha + '</div>' +
          (a.num_especimenes ? '<div style="margin-top:4px;font-size:0.85rem">Especímenes: <strong>' + a.num_especimenes + '</strong></div>' : '') +
          (a.comentario ? '<div style="margin-top:4px;font-size:0.9rem">' + a.comentario + '</div>' : '') +
          '</div>'
        );
      }
    });
  } catch (error) {
    console.log('Error cargando puntos:', error);
  }
}


// -------------------------------------------------------------
// 13. COUNTERS
// -------------------------------------------------------------
async function cargarContadorCabecera() {
  try {
    const { count } = await db.from('avistamientos').select('*', { count: 'exact', head: true });
    document.getElementById('headerTotal').textContent = count || 0;
  } catch (e) { console.log('Error contador cabecera:', e); }
}

async function cargarContadoresTab() {
  try {
    const { count: recibidos }   = await db.from('avistamientos').select('*', { count: 'exact', head: true });
    const { count: verificados } = await db.from('avistamientos').select('*', { count: 'exact', head: true }).eq('verificado', true);
    animarContador('contRecibidos',   recibidos   || 0);
    animarContador('contVerificados', verificados || 0);
    document.getElementById('headerTotal').textContent = recibidos || 0;
  } catch (e) { console.log('Error contadores:', e); }
}

function animarContador(id, valorFinal) {
  const el      = document.getElementById(id);
  const duracion = 1500;
  const inicio   = Date.now();
  const intervalo = setInterval(() => {
    const progreso = Math.min((Date.now() - inicio) / duracion, 1);
    const eased    = 1 - Math.pow(1 - progreso, 3);
    el.textContent = Math.round(valorFinal * eased);
    if (progreso >= 1) clearInterval(intervalo);
  }, 32);
}


// -------------------------------------------------------------
// 14. HELPERS
// -------------------------------------------------------------
function nuevoRegistro() {
  fotosFiles = [null, null, null];
  ubicacion  = '';
  intentado  = false;
  enviando   = false;
  document.querySelectorAll('.hbtn').forEach(b => b.classList.remove('sel-arena', 'sel-agua'));
  document.getElementById('numEspecimenes').value = '1';
  seleccionarFecha(0); // reset to "Hoy"
  document.getElementById('comentario').value      = '';
  document.getElementById('gpsCoords').style.display = 'none';
  const btn = document.getElementById('submitBtn');
  btn.disabled    = false;
  btn.textContent = 'Enviar avistamiento';
  ocultarAviso();
  pintarSlots();
}

function mostrarError(mensaje) {
  const box = document.getElementById('errbox');
  document.getElementById('errtext').textContent = mensaje;
  box.style.display = 'flex';
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { box.style.display = 'none'; }, 5000);
}