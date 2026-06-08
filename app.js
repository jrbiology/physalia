// =============================================================
// app.js — Lógica principal de la app Physalia
// =============================================================


// -------------------------------------------------------------
// 1. CONFIGURACIÓN
// -------------------------------------------------------------

const SUPABASE_URL = 'https://pssmplbphbdflxaynwfy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gqhqYeYe3SnNKdp7ZujU5w_AfZu5YdI';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);


// -------------------------------------------------------------
// 2. VARIABLES GLOBALES
// -------------------------------------------------------------

let miLatitud          = null;
let miLongitud         = null;
let mapaRegistro       = null;
let mapaAgradecimiento = null;
let marcadorUsuario    = null;
let fotosSeleccionadas = [null, null, null];


// -------------------------------------------------------------
// 3. INICIO — Se ejecuta cuando la página termina de cargar
// -------------------------------------------------------------

window.addEventListener('load', function() {
  // Obtenemos el GPS en segundo plano desde el principio
  // para tenerlo listo cuando el usuario pulse Participa
  obtenerGPS();
  cargarContadorCabecera();

  // Indicadores del carrusel
  var carrusel = document.querySelector('.carrusel');
  if (carrusel) {
    carrusel.addEventListener('scroll', function() {
      var indice = Math.round(carrusel.scrollLeft / carrusel.offsetWidth);
      document.querySelectorAll('.indicador').forEach(function(ind, i) {
        ind.classList.toggle('activo', i === indice);
      });
    });
  }
});


// -------------------------------------------------------------
// 4. NAVEGACIÓN
// -------------------------------------------------------------

// Desde los botones del nav
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
    // Pedimos GPS y esperamos la respuesta antes de mostrar el mapa
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
        // Si falla el GPS iniciamos el mapa igual centrado en Asturias
        mostrarEstadoGPS('No se pudo obtener la ubicación', false);
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

// Desde botones dentro de la app (sin pasar el botón del nav)
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
        mostrarEstadoGPS('No se pudo obtener la ubicación', false);
        iniciarMapaRegistro();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  if (id === 'agradecimiento') {
    cargarContadoresTab();
    setTimeout(function() { iniciarMapaAgradecimiento(); }, 300);
  }

  if (id === 'bienvenida') {
    nuevoRegistro();
  }
}


// -------------------------------------------------------------
// 5. GPS
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

      // Si el mapa ya está iniciado lo centramos
      if (mapaRegistro) actualizarMapaConPosicion(miLatitud, miLongitud);
    },
    function(error) {
      var mensaje = 'No se pudo obtener la ubicación';
      if (error.code === 1) mensaje = 'Permiso de ubicación denegado';
      if (error.code === 2) mensaje = 'GPS no disponible';
      if (error.code === 3) mensaje = 'Tiempo de espera agotado';
      mostrarEstadoGPS(mensaje, false);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function mostrarEstadoGPS(texto, estado) {
  var textoEl = document.getElementById('gps-texto');
  var punto = document.getElementById('gps-punto');
  if (!textoEl || !punto) return;
  textoEl.textContent = texto;
  punto.className = 'gps-punto';
  if (estado === 'obtenido') punto.classList.add('obtenido');
  if (estado === 'buscando') punto.classList.add('buscando');
}

function mostrarCoordenadas(lat, lng) {
  var div = document.getElementById('gps-coordenadas');
  if (!div) return;
  div.textContent = lat.toFixed(5) + ' N,  ' + lng.toFixed(5) + ' W';
  div.style.display = 'block';
}


// -------------------------------------------------------------
// 6. SELECTORES
// -------------------------------------------------------------

function seleccionar(grupoId, botonPulsado) {
  var grupo = document.getElementById(grupoId);
  if (!grupo) return;
  grupo.querySelectorAll('.selector-opcion').forEach(function(b) {
    b.classList.remove('seleccionado');
  });
  botonPulsado.classList.add('seleccionado');
  document.getElementById('ubicacion-carabela').value = botonPulsado.dataset.valor;
}


// -------------------------------------------------------------
// 7. MAPA DE REGISTRO
// Destruye el mapa anterior y crea uno nuevo cada vez
// -------------------------------------------------------------

function iniciarMapaRegistro() {
  // Destruimos el mapa anterior si existe
  if (mapaRegistro) {
    mapaRegistro.remove();
    mapaRegistro = null;
    marcadorUsuario = null;
  }

  // Creamos el mapa centrado en Asturias por defecto
  mapaRegistro = L.map('mapa').setView([43.626177002883075, -5.876990546350287], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapaRegistro);

  // Si ya tenemos GPS lo usamos inmediatamente
  if (miLatitud && miLongitud) {
    actualizarMapaConPosicion(miLatitud, miLongitud);
  } else {
    // Si no tenemos GPS aún, pedimos de nuevo
    obtenerGPS();
  }
}

function actualizarMapaConPosicion(lat, lng) {
  if (!mapaRegistro) return;

  mapaRegistro.setView([lat, lng], 15);

  // Quitamos el marcador anterior si existe
  if (marcadorUsuario) {
    mapaRegistro.removeLayer(marcadorUsuario);
    marcadorUsuario = null;
  }

  // Creamos el marcador arrastrable
  marcadorUsuario = L.marker([lat, lng], { draggable: true }).addTo(mapaRegistro);

  marcadorUsuario.bindTooltip('Arrastra para ajustar', {
    permanent: false,
    direction: 'top',
    offset: [0, -10]
  });

  // Al arrastrar actualizamos las coordenadas
  marcadorUsuario.on('dragend', function() {
    var pos = marcadorUsuario.getLatLng();
    miLatitud  = pos.lat;
    miLongitud = pos.lng;
    var latInput = document.getElementById('latitud');
    var lngInput = document.getElementById('longitud');
    if (latInput) latInput.value = miLatitud;
    if (lngInput) lngInput.value = miLongitud;
    mostrarEstadoGPS('Posición ajustada', 'obtenido');
    mostrarCoordenadas(miLatitud, miLongitud);
  });

  // Al hacer clic en el mapa movemos el marcador
  mapaRegistro.off('click');
  mapaRegistro.on('click', function(e) {
    miLatitud  = e.latlng.lat;
    miLongitud = e.latlng.lng;
    marcadorUsuario.setLatLng([miLatitud, miLongitud]);
    var latInput = document.getElementById('latitud');
    var lngInput = document.getElementById('longitud');
    if (latInput) latInput.value = miLatitud;
    if (lngInput) lngInput.value = miLongitud;
    mostrarEstadoGPS('Posición ajustada', 'obtenido');
    mostrarCoordenadas(miLatitud, miLongitud);
  });
}


// -------------------------------------------------------------
// 8. FOTOS
// -------------------------------------------------------------

function abrirSelector(indice) {
  var slot = document.getElementById('slot-' + indice);
  if (!slot) return;
  slot.querySelector('input[type="file"]').click();
}

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
    '<input type="file" onchange="previsualizarFoto(this, ' + indice + ')" style="display:none">';

  // Activamos el siguiente slot
  var siguiente = document.getElementById('slot-' + (indice + 1));
  if (siguiente) siguiente.classList.remove('desactivado');

  // Ocultamos el aviso y reseteamos el botón
  var aviso = document.getElementById('aviso-sin-foto');
  if (aviso) aviso.style.display = 'none';
  var boton = document.getElementById('boton-enviar');
  if (boton) {
    boton.textContent = 'Enviar avistamiento';
    boton.dataset.intentado = 'false';
  }
}

function borrarFoto(evento, indice) {
  evento.stopPropagation();
  fotosSeleccionadas[indice] = null;

  var slot = document.getElementById('slot-' + indice);
  slot.innerHTML =
    '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
    '<input type="file" onchange="previsualizarFoto(this, ' + indice + ')" style="display:none">';

  // Desactivamos los slots siguientes
  for (var i = indice + 1; i < 3; i++) {
    fotosSeleccionadas[i] = null;
    var slotSiguiente = document.getElementById('slot-' + i);
    if (!slotSiguiente) continue;
    slotSiguiente.classList.add('desactivado');
    slotSiguiente.innerHTML =
      '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
      '<input type="file" onchange="previsualizarFoto(this, ' + i + ')" style="display:none">';
  }
}

function resetearFotos() {
  fotosSeleccionadas = [null, null, null];
  for (var i = 0; i < 3; i++) {
    var slot = document.getElementById('slot-' + i);
    if (!slot) continue;
    slot.classList.remove('desactivado');
    if (i > 0) slot.classList.add('desactivado');
    slot.innerHTML =
      '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
      '<input type="file" onchange="previsualizarFoto(this, ' + i + ')" style="display:none">';
  }
}


// -------------------------------------------------------------
// 9. ENVIAR AVISTAMIENTO
// -------------------------------------------------------------

async function enviarAvistamiento() {
  if (!miLatitud || !miLongitud) {
    mostrarError('Espera a que se obtenga la ubicación GPS.');
    return;
  }

  // Si no hay fotos avisamos la primera vez
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
    // Segunda vez: continúa sin fotos
  }

  var boton = document.getElementById('boton-enviar');
  boton.disabled = true;
  boton.textContent = 'Enviando...';

  try {
    // PASO 1: Subir fotos
    var fotosUrls = [null, null, null];

    for (var i = 0; i < 3; i++) {
      if (fotosSeleccionadas[i]) {
        var nombreFoto = 'avistamiento_' + Date.now() + '_' + i + '_' + fotosSeleccionadas[i].name;

        var { error: errorFoto } = await db
          .storage
          .from('fotos')
          .upload(nombreFoto, fotosSeleccionadas[i]);

        if (errorFoto) throw new Error('Error subiendo foto: ' + errorFoto.message);

        var { data: urlData } = db
          .storage
          .from('fotos')
          .getPublicUrl(nombreFoto);

        fotosUrls[i] = urlData.publicUrl;
      }
    }

    // PASO 2: Guardar en la base de datos
    var { error: errorDB } = await db
      .from('avistamientos')
      .insert({
        latitud:            miLatitud,
        longitud:           miLongitud,
        comentario:         document.getElementById('comentario').value,
        observador:         document.getElementById('observador').value,
        foto_url:           fotosUrls[0],
        foto_url2:          fotosUrls[1],
        foto_url3:          fotosUrls[2],
        ubicacion_carabela: document.getElementById('ubicacion-carabela').value,
        verificado:         true
      });

    if (errorDB) throw new Error('Error guardando datos: ' + errorDB.message);

    // PASO 3: Ir a agradecimiento
    mostrarSeccionDirecta('agradecimiento');

  } catch (error) {
    mostrarError('Error al enviar: ' + error.message);
    boton.disabled = false;
    boton.textContent = 'Enviar avistamiento';
  }
}


// -------------------------------------------------------------
// 10. MAPA DE AGRADECIMIENTO
// -------------------------------------------------------------

function iniciarMapaAgradecimiento() {
  if (mapaAgradecimiento) {
    mapaAgradecimiento.invalidateSize();
    cargarPuntosEnMapa(mapaAgradecimiento);
    return;
  }

  mapaAgradecimiento = L.map('mapa-agradecimiento').setView([43.5, -5.8], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapaAgradecimiento);

  cargarPuntosEnMapa(mapaAgradecimiento);
}

async function cargarPuntosEnMapa(mapa) {
  try {
    var { data: avistamientos } = await db
      .from('avistamientos')
      .select('*')
      .eq('verificado', true)
      .order('created_at', { ascending: false });

    if (!avistamientos || avistamientos.length === 0) return;

    avistamientos.forEach(function(a) {
      var marcador = L.circleMarker([a.latitud, a.longitud], {
        radius: 8,
        fillColor: '#00c2b8',
        color: '#0a4f6e',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(mapa);

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
        (a.comentario ? '<div style="margin-top:4px;font-size:0.9rem">' + a.comentario + '</div>' : '') +
        '</div>';

      marcador.bindPopup(popup);
    });

  } catch (error) {
    console.log('Error cargando puntos:', error);
  }
}


// -------------------------------------------------------------
// 11. CONTADORES
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

    animarContador('contador-recibidos-tab', totalRecibidos || 0);
    animarContador('contador-verificados-tab', totalVerificados || 0);

    var el = document.getElementById('header-total');
    if (el) el.textContent = totalRecibidos || 0;

  } catch (error) {
    console.log('Error cargando contadores:', error);
  }
}

function animarContador(elementoId, valorFinal) {
  var elemento = document.getElementById(elementoId);
  if (!elemento) return;

  var duracion = 1500;
  var inicio = Date.now();

  var intervalo = setInterval(function() {
    var transcurrido = Date.now() - inicio;
    var progreso = Math.min(transcurrido / duracion, 1);
    var eased = 1 - Math.pow(1 - progreso, 3);
    elemento.textContent = Math.round(valorFinal * eased);
    if (progreso >= 1) clearInterval(intervalo);
  }, 16);
}


// -------------------------------------------------------------
// 12. RESETEAR FORMULARIO
// No toca el mapa — eso lo gestiona iniciarMapaRegistro
// -------------------------------------------------------------

function nuevoRegistro() {
  var campos = ['comentario', 'observador', 'ubicacion-carabela'];
  campos.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });

  var error = document.getElementById('error-registro');
  if (error) error.style.display = 'none';

  var aviso = document.getElementById('aviso-sin-foto');
  if (aviso) aviso.style.display = 'none';

  // Reseteamos selectores
  document.querySelectorAll('.selector-opcion').forEach(function(b) {
    b.classList.remove('seleccionado');
  });

  // Arena por defecto
  var botonArena = document.querySelector('#selector-ubicacion [data-valor="arena"]');
  if (botonArena) seleccionar('selector-ubicacion', botonArena);

  // Fotos vacías
  resetearFotos();

  // Botón de envío
  var boton = document.getElementById('boton-enviar');
  if (boton) {
    boton.disabled = false;
    boton.textContent = 'Enviar avistamiento';
    boton.dataset.intentado = 'false';
  }
}


// -------------------------------------------------------------
// 13. MOSTRAR ERROR
// -------------------------------------------------------------

function mostrarError(mensaje) {
  var div = document.getElementById('error-registro');
  if (!div) return;
  div.textContent = mensaje;
  div.style.display = 'block';
  setTimeout(function() { div.style.display = 'none'; }, 5000);
}