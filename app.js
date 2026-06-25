// =============================================================
// app.js — Physalia Citizen Science Radar
// =============================================================
//
// This file contains all the logic for the sighting-registration
// PWA. The overall flow is:
//
//   1. Page loads → GPS is requested in the background and the
//      registration map is initialised immediately.
//   2. The volunteer fills in the form (habitat, count, photos).
//   3. On submit, photos are sanitised (EXIF stripped, resized)
//      and uploaded to Supabase Storage; the sighting record is
//      then inserted into the database with verified = false.
//   4. The thank-you screen is shown, displaying live counters
//      and a map of all sightings (verified and pending).
//
// To adapt this project to a different species or study area:
//   · Update SUPABASE_URL and SUPABASE_KEY (section 1).
//   · Change the default map centre coordinates (section 7 & 10).
//   · Adjust the database column names if needed (section 9).
// =============================================================


// -------------------------------------------------------------
// 1. CONFIGURATION
// Replace these two values with your own Supabase project.
// See README.md for step-by-step instructions.
// -------------------------------------------------------------

const SUPABASE_URL = 'https://pssmplbphbdflxaynwfy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gqhqYeYe3SnNKdp7ZujU5w_AfZu5YdI';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);



// -------------------------------------------------------------
// 2. GLOBAL STATE
// All mutable state is kept here so every function can access it.
// -------------------------------------------------------------

let miLatitud          = null;  // Latitude of the current GPS fix
let miLongitud         = null;  // Longitude of the current GPS fix
let ultimoLatitud      = null;  // Coordinates of the last submitted sighting
let ultimoLongitud     = null;  // (used to highlight the user's own point on the map)
let mapaRegistro       = null;  // Leaflet map instance — registration screen
let mapaAgradecimiento = null;  // Leaflet map instance — thank-you screen
let marcadorUsuario    = null;  // Draggable pin on the registration map
let capasAgradecimiento = [];   // All Leaflet layers on the thank-you map (tracked for cleanup)
let fotosSeleccionadas = [null, null, null]; // Up to three File objects chosen by the user


// -------------------------------------------------------------
// 3. STARTUP
// On page load we immediately request GPS and initialise the map
// so the volunteer doesn't have to wait when they start typing.
// -------------------------------------------------------------

window.addEventListener('load', function() {
  cargarContadorCabecera(); // Show total sighting count in the header
  nuevoRegistro();          // Reset the form to a clean state
  obtenerGPS();             // Begin GPS acquisition in the background while the user reads the welcome screen
});


// -------------------------------------------------------------
// 4. NAVIGATION
// Two functions control which section is visible:
//   · mostrarSeccion()       — called by the nav bar buttons
//   · mostrarSeccionDirecta() — called programmatically (e.g. after submit)
// Both initialise any data the target section needs.
// -------------------------------------------------------------

// Called when the user clicks a navigation button.
// `boton` is the button element that was clicked, so we can mark it active.
function mostrarSeccion(id, boton) {
  document.querySelectorAll('.seccion').forEach(function(s) {
    s.classList.remove('visible');
  });
  document.querySelectorAll('nav button').forEach(function(b) {
    b.classList.remove('activa');
  });
  document.getElementById(id).classList.add('visible');
  boton.classList.add('activa');

  if (id === 'registrar') {
    nuevoRegistro();
    // Re-acquire GPS every time the form is opened; the user may have
    // moved since the last fix, or the initial fix may have failed.
    navigator.geolocation.getCurrentPosition(
      function(posicion) {
        miLatitud  = posicion.coords.latitude;
        miLongitud = posicion.coords.longitude;
        document.getElementById('latitud').value  = miLatitud;
        document.getElementById('longitud').value = miLongitud;
        mostrarEstadoGPS('Ubicación obtenida', 'obtenido');
        mostrarCoordenadas(miLatitud, miLongitud);
        iniciarMapaRegistro();
      },
      function() {
        mostrarEstadoGPS('GPS no disponible — toca el mapa para indicar la ubicación', false);
        iniciarMapaRegistro();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (id === 'agradecimiento') {
    cargarContadoresTab();
    // Brief delay lets the section become visible before the map renders,
    // preventing a common Leaflet sizing bug on hidden elements.
    setTimeout(function() { iniciarMapaAgradecimiento(); }, 300);
  }
}

// Called programmatically (e.g. after a successful submission or from
// the "Participate" button on the welcome screen). Finds and highlights
// the matching nav button automatically.
function mostrarSeccionDirecta(id) {
  document.querySelectorAll('.seccion').forEach(function(s) {
    s.classList.remove('visible');
  });
  document.querySelectorAll('nav button').forEach(function(b) {
    b.classList.remove('activa');
    if (b.getAttribute('onclick') && b.getAttribute('onclick').includes(id)) {
      b.classList.add('activa');
    }
  });
  document.getElementById(id).classList.add('visible');

  if (id === 'registrar') {
    nuevoRegistro();
    navigator.geolocation.getCurrentPosition(
      function(posicion) {
        miLatitud  = posicion.coords.latitude;
        miLongitud = posicion.coords.longitude;
        document.getElementById('latitud').value  = miLatitud;
        document.getElementById('longitud').value = miLongitud;
        mostrarEstadoGPS('Ubicación obtenida', 'obtenido');
        mostrarCoordenadas(miLatitud, miLongitud);
        iniciarMapaRegistro();
      },
      function() {
        mostrarEstadoGPS('GPS no disponible — toca el mapa para indicar la ubicación', false);
        iniciarMapaRegistro();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (id === 'agradecimiento') {
    cargarContadoresTab();
    setTimeout(function() { iniciarMapaAgradecimiento(); }, 300);
  }
}


// -------------------------------------------------------------
// 5. GPS
// Requests the device position as soon as the page loads.
// On mobile this uses the hardware GPS chip; on desktop it falls
// back to a Wi-Fi / IP-based estimate (less accurate).
// The app requires HTTPS in production — modern browsers block
// Geolocation on plain HTTP connections.
// -------------------------------------------------------------

function obtenerGPS() {
  if (!navigator.geolocation) {
    mostrarEstadoGPS('Tu navegador no soporta GPS', false);
    return;
  }

  mostrarEstadoGPS('Obteniendo ubicación...', 'buscando');

  navigator.geolocation.getCurrentPosition(
    function(posicion) {
      miLatitud  = posicion.coords.latitude;
      miLongitud = posicion.coords.longitude;

      var latInput = document.getElementById('latitud');
      var lngInput = document.getElementById('longitud');
      if (latInput) latInput.value = miLatitud;
      if (lngInput) lngInput.value = miLongitud;

      mostrarEstadoGPS('Ubicación obtenida', 'obtenido');
      mostrarCoordenadas(miLatitud, miLongitud);

      // If the map is already on screen, centre it on the new position.
      if (mapaRegistro) actualizarMapaConPosicion(miLatitud, miLongitud);
    },
    function(error) {
      var base = 'Toca el mapa para indicar la ubicación';
      if (error.code === 1) base = 'Permiso denegado — toca el mapa para indicar la ubicación';
      if (error.code === 2) base = 'GPS no disponible — toca el mapa para indicar la ubicación';
      if (error.code === 3) base = 'Tiempo agotado — toca el mapa para indicar la ubicación';
      mostrarEstadoGPS(base, false);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Updates the coloured dot and status text in the GPS widget.
// `estado` can be 'obtenido' (green), 'buscando' (pulsing), or false (grey).
function mostrarEstadoGPS(texto, estado) {
  var textoEl = document.getElementById('gps-texto');
  var punto   = document.getElementById('gps-punto');
  if (!textoEl || !punto) return;
  textoEl.textContent = texto;
  punto.className = 'gps-punto';
  if (estado === 'obtenido') punto.classList.add('obtenido');
  if (estado === 'buscando') punto.classList.add('buscando');
}

// Displays the decimal-degree coordinates below the GPS status text.
function mostrarCoordenadas(lat, lng) {
  var div = document.getElementById('gps-coordenadas');
  if (!div) return;
  var latDir = lat >= 0 ? 'N' : 'S';
  var lngDir = lng >= 0 ? 'E' : 'W';
  div.textContent = Math.abs(lat).toFixed(5) + ' ' + latDir + ',  ' + Math.abs(lng).toFixed(5) + ' ' + lngDir;
  div.style.display = 'block';
}


// -------------------------------------------------------------
// 6. LOCATION SELECTORS  (water / sand)
// Handles the two-button toggle that records whether the specimen
// was seen in the water or stranded on the beach.
// -------------------------------------------------------------

function seleccionar(grupoId, botonPulsado) {
  var grupo = document.getElementById(grupoId);
  if (!grupo) return;
  grupo.querySelectorAll('.selector-opcion').forEach(function(b) {
    b.classList.remove('seleccionado');
  });
  botonPulsado.classList.add('seleccionado');
  // Write the selected value ('arena' or 'agua') to the hidden input
  // so enviarAvistamiento() can read it at submission time.
  document.getElementById('ubicacion-carabela').value = botonPulsado.dataset.valor;
}


// -------------------------------------------------------------
// 7. REGISTRATION MAP
// Shows an interactive Leaflet map centred on Asturias by default.
// Once GPS arrives, the map re-centres on the user's position and
// places a draggable pink pin. If GPS is unavailable or denied the
// volunteer can tap anywhere on the map to set the location manually.
// To adapt to a different region, change the coordinates and zoom
// in the setView() call below.
// -------------------------------------------------------------

function iniciarMapaRegistro() {
  // Destroy any existing map instance before creating a new one
  // to avoid "map container already initialised" errors.
  if (mapaRegistro) {
    mapaRegistro.remove();
    mapaRegistro = null;
    marcadorUsuario = null;
  }

  // Default centre: Gijón, Asturias — adjust for your study area
  mapaRegistro = L.map('mapa').setView([43.626177002883075, -5.876990546350287], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapaRegistro);

  // Single click handler — always active regardless of GPS success.
  // Creates the pin on first tap and moves it on subsequent taps.
  mapaRegistro.on('click', function(e) {
    miLatitud  = e.latlng.lat;
    miLongitud = e.latlng.lng;
    document.getElementById('latitud').value  = miLatitud;
    document.getElementById('longitud').value = miLongitud;
    colocarMarcadorRegistro(miLatitud, miLongitud);
    mostrarEstadoGPS('Ubicación seleccionada manualmente', 'obtenido');
    mostrarCoordenadas(miLatitud, miLongitud);
  });

  // If GPS was already obtained before the map was ready, centre on it now.
  if (miLatitud && miLongitud) {
    actualizarMapaConPosicion(miLatitud, miLongitud);
  }
}

// Places or moves the draggable pink pin to the given coordinates.
// Called both on GPS success and on manual map tap.
function colocarMarcadorRegistro(lat, lng) {
  if (!mapaRegistro) return;

  if (marcadorUsuario) {
    mapaRegistro.removeLayer(marcadorUsuario);
    marcadorUsuario = null;
  }

  // Custom pink pin — colour matches the Physalia pneumatophore and
  // the circle shown on the thank-you map for visual continuity.
  var iconoPin = L.divIcon({
    className: '',
    html: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 41" width="25" height="41">' +
          '<path fill="#d4387a" stroke="#a02860" stroke-width="1.5" d="M12.5 0C5.6 0 0 5.6 0 12.5c0 8.3 12.5 28.5 12.5 28.5S25 20.8 25 12.5C25 5.6 19.4 0 12.5 0z"/>' +
          '<circle fill="white" cx="12.5" cy="12.5" r="4.5"/>' +
          '</svg>',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  });

  marcadorUsuario = L.marker([lat, lng], { draggable: true, icon: iconoPin }).addTo(mapaRegistro);

  marcadorUsuario.bindTooltip('Arrastra para ajustar', {
    permanent: false,
    direction: 'top',
    offset: [0, -10]
  });

  // Update coordinates when the volunteer drags the pin manually
  marcadorUsuario.on('dragend', function() {
    var pos = marcadorUsuario.getLatLng();
    miLatitud  = pos.lat;
    miLongitud = pos.lng;
    document.getElementById('latitud').value  = miLatitud;
    document.getElementById('longitud').value = miLongitud;
    mostrarEstadoGPS('Posición ajustada', 'obtenido');
    mostrarCoordenadas(miLatitud, miLongitud);
  });
}

// Re-centres the map on the given GPS coordinates and places the pin.
function actualizarMapaConPosicion(lat, lng) {
  if (!mapaRegistro) return;
  mapaRegistro.setView([lat, lng], 15);
  colocarMarcadorRegistro(lat, lng);
}


// -------------------------------------------------------------
// 8. PHOTO HANDLING — EXIF strip + resize
// Before uploading, every photo is:
//   1. Drawn onto an HTML canvas (which discards all metadata).
//   2. Scaled so neither dimension exceeds 2048 px.
//   3. Re-encoded as JPEG at 85 % quality.
// This removes any GPS coordinates embedded by the camera in the
// EXIF header, protecting the photographer's location privacy.
// It also significantly reduces file size for faster uploads.
// -------------------------------------------------------------

function stripMetadatosYRedimensionar(fichero) {
  return new Promise(function(resolve, reject) {
    var url = URL.createObjectURL(fichero);
    var img = new Image();

    img.onload = function() {
      URL.revokeObjectURL(url);

      var MAX = 2048;
      var w = img.naturalWidth;
      var h = img.naturalHeight;

      // Scale down proportionally if either side exceeds the maximum
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else       { w = Math.round(w * MAX / h); h = MAX; }
      }

      var canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);

      // toBlob re-encodes as JPEG — the canvas API never copies EXIF data
      canvas.toBlob(function(blob) {
        if (!blob) { reject(new Error('No se pudo procesar la imagen')); return; }
        resolve(blob);
      }, 'image/jpeg', 0.85);
    };

    img.onerror = function() {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };

    img.src = url;
  });
}

// Triggers the hidden file input inside a photo slot.
// `accept="image/*"` on the input lets mobile browsers offer both
// the camera and the photo library as sources.
function abrirSelector(indice) {
  var slot = document.getElementById('slot-' + indice);
  if (!slot) return;
  slot.querySelector('input[type="file"]').click();
}

// Called when a photo is chosen. Shows a thumbnail preview and
// unlocks the next slot once the current one is filled.
function previsualizarFoto(input, indice) {
  var fichero = input.files[0];
  if (!fichero) return;

  if (!fichero.type.startsWith('image/')) {
    mostrarError('Por favor selecciona solo imágenes');
    return;
  }

  fotosSeleccionadas[indice] = fichero;

  var urlTemporal = URL.createObjectURL(fichero);
  var slot = document.getElementById('slot-' + indice);

  slot.innerHTML =
    '<img src="' + urlTemporal + '" alt="Foto ' + (indice + 1) + '">' +
    '<button class="foto-borrar" onclick="borrarFoto(event, ' + indice + ')">✕</button>' +
    '<input type="file" accept="image/*" onchange="previsualizarFoto(this, ' + indice + ')" style="display:none">';

  // Unlock the next slot
  var siguiente = document.getElementById('slot-' + (indice + 1));
  if (siguiente) siguiente.classList.remove('desactivado');

  // Hide the soft warning and reset the submit button text
  var aviso = document.getElementById('aviso-sin-foto');
  if (aviso) aviso.style.display = 'none';
  var boton = document.getElementById('boton-enviar');
  if (boton) {
    boton.textContent = 'Enviar avistamiento';
    boton.dataset.intentado = 'false';
  }
}

// Removes a photo and all slots after it (slots must stay sequential).
function borrarFoto(evento, indice) {
  evento.stopPropagation();
  fotosSeleccionadas[indice] = null;

  var slot = document.getElementById('slot-' + indice);
  slot.innerHTML =
    '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
    '<input type="file" accept="image/*" onchange="previsualizarFoto(this, ' + indice + ')" style="display:none">';

  // Lock and clear all subsequent slots
  for (var i = indice + 1; i < 3; i++) {
    fotosSeleccionadas[i] = null;
    var slotSiguiente = document.getElementById('slot-' + i);
    if (!slotSiguiente) continue;
    slotSiguiente.classList.add('desactivado');
    slotSiguiente.innerHTML =
      '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
      '<input type="file" accept="image/*" onchange="previsualizarFoto(this, ' + i + ')" style="display:none">';
  }
}

// Resets all three photo slots to their initial empty state.
function resetearFotos() {
  fotosSeleccionadas = [null, null, null];
  for (var i = 0; i < 3; i++) {
    var slot = document.getElementById('slot-' + i);
    if (!slot) continue;
    slot.classList.remove('desactivado');
    if (i > 0) slot.classList.add('desactivado');
    slot.innerHTML =
      '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
      '<input type="file" accept="image/*" onchange="previsualizarFoto(this, ' + i + ')" style="display:none">';
  }
}


// -------------------------------------------------------------
// 9. SUBMIT SIGHTING
// Validates the form, uploads photos to Supabase Storage, and
// inserts a new row in the "avistamientos" table.
//
// All new records start with verified = false. A researcher must
// review and mark them as verified = true before they appear as
// turquoise circles on the public map.
//
// Database columns expected:
//   latitud, longitud, comentario, num_especimenes,
//   foto_url, foto_url2, foto_url3, ubicacion_carabela, verificado
// -------------------------------------------------------------

async function enviarAvistamiento() {
  // GPS is required — the submission cannot proceed without coordinates
  if (!miLatitud || !miLongitud) {
    mostrarError('Indica la ubicación: toca el mapa para colocar el marcador.');
    return;
  }

  // Habitat type is required (water or sand)
  var ubicacion = document.getElementById('ubicacion-carabela').value;
  if (!ubicacion) {
    mostrarError('Por favor indica si la carabela está en el agua o en la arena.');
    return;
  }

  // If no photos are attached, show a soft warning on the first attempt.
  // A second press of the button confirms the user wants to submit anyway.
  var hayFoto = fotosSeleccionadas.some(function(f) { return f !== null; });
  if (!hayFoto) {
    var botonAviso = document.getElementById('boton-enviar');
    if (botonAviso.dataset.intentado !== 'true') {
      botonAviso.textContent = 'Enviar sin fotos';
      botonAviso.dataset.intentado = 'true';
      var aviso = document.getElementById('aviso-sin-foto');
      if (aviso) aviso.style.display = 'block';
      return;
    }
  }

  var boton = document.getElementById('boton-enviar');
  boton.disabled = true;
  boton.textContent = 'Enviando...';

  try {
    // STEP 1 — Upload photos
    // Each photo is sanitised (EXIF stripped, resized) before upload.
    // The public URL returned by Supabase is stored in the database row.
    var fotosUrls = [null, null, null];

    for (var i = 0; i < 3; i++) {
      if (fotosSeleccionadas[i]) {
        var blobLimpio   = await stripMetadatosYRedimensionar(fotosSeleccionadas[i]);
        var nombreFoto   = 'avistamiento_' + Date.now() + '_' + i + '.jpg';

        var { error: errorFoto } = await db
          .storage
          .from('fotos')
          .upload(nombreFoto, blobLimpio, { contentType: 'image/jpeg' });

        if (errorFoto) throw new Error('Error subiendo foto: ' + errorFoto.message);

        var { data: urlData } = db
          .storage
          .from('fotos')
          .getPublicUrl(nombreFoto);

        fotosUrls[i] = urlData.publicUrl;
      }
    }

    // STEP 2 — Save the sighting record in the database
    var numEspecimenes = parseInt(document.getElementById('num-especimenes').value, 10);

    var { error: errorDB } = await db
      .from('avistamientos')
      .insert({
        latitud:            miLatitud,
        longitud:           miLongitud,
        comentario:         document.getElementById('comentario').value,
        num_especimenes:    isNaN(numEspecimenes) ? null : numEspecimenes,
        foto_url:           fotosUrls[0],
        foto_url2:          fotosUrls[1],
        foto_url3:          fotosUrls[2],
        ubicacion_carabela: ubicacion,
        verificado:         false  // Always starts unverified; researchers review later
      });

    if (errorDB) throw new Error('Error guardando datos: ' + errorDB.message);

    // Save coordinates so the thank-you map can highlight this sighting
    ultimoLatitud  = miLatitud;
    ultimoLongitud = miLongitud;
    mostrarSeccionDirecta('agradecimiento');

  } catch (error) {
    mostrarError('Error al enviar: ' + error.message);
    boton.disabled = false;
    boton.textContent = 'Enviar avistamiento';
  }
}


// -------------------------------------------------------------
// 10. THANK-YOU MAP
// Loads all sightings from the database and displays them:
//   · Turquoise circle  = verified by researchers (interactive popup)
//   · Grey circle       = pending review (not interactive)
//   · Pink circle       = the sighting just submitted by this user
//
// The map is centred on the Asturian coastline at zoom 8 so the
// entire study area is visible. Adjust setView() for other regions.
// -------------------------------------------------------------

async function iniciarMapaAgradecimiento() {
  if (mapaAgradecimiento) {
    // The map already exists — just refresh its size and reload the points
    mapaAgradecimiento.invalidateSize();
    limpiarCapasAgradecimiento();
    await cargarPuntosEnMapa(mapaAgradecimiento);
    añadirMarcadorPropio(mapaAgradecimiento);
    return;
  }

  // Default centre: Asturias coast — adjust for your study area
  mapaAgradecimiento = L.map('mapa-agradecimiento').setView([43.37, -5.86], 8);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapaAgradecimiento);

  await cargarPuntosEnMapa(mapaAgradecimiento);
  añadirMarcadorPropio(mapaAgradecimiento);
}

// Adds a distinct pink circle at the coordinates of the sighting
// just submitted, so the volunteer can see exactly where it landed.
function añadirMarcadorPropio(mapa) {
  if (!ultimoLatitud || !ultimoLongitud) return;

  var marcador = L.circleMarker([ultimoLatitud, ultimoLongitud], {
    radius: 11,
    fillColor: '#d4387a', // Physalia pink
    color: '#a02860',
    weight: 2.5,
    opacity: 1,
    fillOpacity: 0.95
  }).addTo(mapa);

  capasAgradecimiento.push(marcador);
  marcador.bindPopup(
    '<div style="font-size:0.9rem;font-family:Georgia,serif;color:#444">Tu avistamiento</div>'
  ).openPopup();
}

// Removes all sighting layers from the thank-you map.
// Called before reloading the points to avoid duplicates.
function limpiarCapasAgradecimiento() {
  capasAgradecimiento.forEach(function(capa) {
    mapaAgradecimiento.removeLayer(capa);
  });
  capasAgradecimiento = [];
}

// Fetches all sightings from the database and adds one circle per record.
async function cargarPuntosEnMapa(mapa) {
  try {
    var { data: avistamientos } = await db
      .from('avistamientos')
      .select('*')
      .order('created_at', { ascending: false });

    if (!avistamientos || avistamientos.length === 0) return;

    avistamientos.forEach(function(a) {
      var verificado = a.verificado;

      var marcador = L.circleMarker([a.latitud, a.longitud], {
        radius:      8,
        fillColor:   verificado ? '#00c2b8' : '#aaaaaa', // Turquoise = verified, grey = pending
        color:       verificado ? '#0a4f6e' : '#888888',
        weight:      2,
        opacity:     1,
        fillOpacity: 0.8,
        interactive: verificado // Pending sightings have no popup (not yet confirmed)
      }).addTo(mapa);

      capasAgradecimiento.push(marcador);

      // Only verified sightings show a popup with photo and metadata
      if (verificado) {
        var fecha = new Date(a.created_at).toLocaleDateString('es-ES');

        var fotos = [a.foto_url, a.foto_url2, a.foto_url3]
          .filter(function(f) { return f; })
          .map(function(f) {
            return '<img src="' + f + '" style="width:60px;height:60px;object-fit:cover;border-radius:6px;">';
          }).join('');

        var popup =
          '<div style="max-width:220px">' +
          (fotos ? '<div style="display:flex;gap:4px;margin-bottom:6px">' + fotos + '</div>' : '') +
          '<div style="font-size:0.8rem;color:#666">' + fecha + '</div>' +
          (a.num_especimenes ? '<div style="margin-top:4px;font-size:0.85rem;color:#444">Especímenes: <strong>' + a.num_especimenes + '</strong></div>' : '') +
          (a.comentario ? '<div style="margin-top:4px;font-size:0.9rem">' + a.comentario + '</div>' : '') +
          '</div>';

        marcador.bindPopup(popup);
      }
    });

  } catch (error) {
    console.log('Error cargando puntos:', error);
  }
}


// -------------------------------------------------------------
// 11. COUNTERS
// Two counters are shown on the thank-you screen:
//   · "Recibidos"   — total records in the database (grey number)
//   · "Verificados" — records confirmed by researchers (turquoise)
// The header also shows the total count, updated on page load.
// Numbers animate from 0 to their final value for visual feedback.
// -------------------------------------------------------------

async function cargarContadorCabecera() {
  try {
    var { count } = await db
      .from('avistamientos')
      .select('*', { count: 'exact', head: true });
    var el = document.getElementById('header-total');
    if (el) el.textContent = count || 0;
  } catch (error) {
    console.log('Error cargando contador:', error);
  }
}

async function cargarContadoresTab() {
  try {
    var { count: totalRecibidos } = await db
      .from('avistamientos')
      .select('*', { count: 'exact', head: true });

    var { count: totalVerificados } = await db
      .from('avistamientos')
      .select('*', { count: 'exact', head: true })
      .eq('verificado', true);

    animarContador('contador-recibidos-tab',  totalRecibidos  || 0);
    animarContador('contador-verificados-tab', totalVerificados || 0);

    var el = document.getElementById('header-total');
    if (el) el.textContent = totalRecibidos || 0;

  } catch (error) {
    console.log('Error cargando contadores:', error);
  }
}

// Animates a number from 0 to `valorFinal` over 1.5 seconds using
// a cubic ease-out curve so it feels natural and not mechanical.
function animarContador(elementoId, valorFinal) {
  var elemento = document.getElementById(elementoId);
  if (!elemento) return;

  var duracion = 1500;
  var inicio   = Date.now();

  var intervalo = setInterval(function() {
    var transcurrido = Date.now() - inicio;
    var progreso = Math.min(transcurrido / duracion, 1);
    var eased    = 1 - Math.pow(1 - progreso, 3); // cubic ease-out
    elemento.textContent = Math.round(valorFinal * eased);
    if (progreso >= 1) clearInterval(intervalo);
  }, 16); // ~60 fps
}


// -------------------------------------------------------------
// 12. FORM RESET
// Clears all fields and restores the form to its initial state.
// Called every time the register section is opened so volunteers
// always start with a blank form for their next sighting.
// -------------------------------------------------------------

function nuevoRegistro() {
  // Clear free-text fields and the hidden habitat value
  var campos = ['comentario', 'ubicacion-carabela'];
  campos.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Reset specimen count to default (1)
  var selectEspecimenes = document.getElementById('num-especimenes');
  if (selectEspecimenes) selectEspecimenes.value = '1';

  // Hide error and photo-warning messages
  var error = document.getElementById('error-registro');
  if (error) error.style.display = 'none';

  var aviso = document.getElementById('aviso-sin-foto');
  if (aviso) aviso.style.display = 'none';

  // Deselect the water/sand buttons
  document.querySelectorAll('.selector-opcion').forEach(function(b) {
    b.classList.remove('seleccionado');
  });

  resetearFotos();

  // Re-enable and reset the submit button
  var boton = document.getElementById('boton-enviar');
  if (boton) {
    boton.disabled = false;
    boton.textContent = 'Enviar avistamiento';
    boton.dataset.intentado = 'false';
  }
}


// -------------------------------------------------------------
// 13. ERROR DISPLAY
// Shows an inline error message below the map for 5 seconds.
// Used for GPS failures, validation errors, and upload errors.
// -------------------------------------------------------------

function mostrarError(mensaje) {
  var div = document.getElementById('error-registro');
  if (!div) return;
  div.textContent = mensaje;
  div.style.display = 'block';
  setTimeout(function() { div.style.display = 'none'; }, 5000);
}