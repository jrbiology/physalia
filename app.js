// =============================================================
// app.js — Lógica principal de la app Physalia
// =============================================================


// -------------------------------------------------------------
// 1. CONFIGURACIÓN — CAMBIA ESTOS DOS VALORES POR LOS TUYOS
// -------------------------------------------------------------

const SUPABASE_URL = 'https://pssmplbphbdflxaynwfy.supabase.co';
const SUPABASE_KEY = 'sb_secret_xDrVOJ-aNEXaiidANINQXg_jyG_QbAV'; // ⚠️ Cámbialo

// Creamos la conexión con Supabase
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);


// -------------------------------------------------------------
// 2. VARIABLES GLOBALES
// -------------------------------------------------------------

let miLatitud        = null; // Latitud GPS del usuario
let miLongitud       = null; // Longitud GPS del usuario
let mapaRegistro     = null; // El mapa del formulario
let mapaPublico      = null; // El mapa de la pestaña avistamientos
let mapaGracias      = null; // El mapa de la página de agradecimiento
let marcadorUsuario  = null; // El punto azul en el mapa
let fotoSeleccionada = null; // El fichero de foto


// -------------------------------------------------------------
// 3. INICIO — Se ejecuta cuando la página termina de cargar
// -------------------------------------------------------------

window.addEventListener('load', function() {
  iniciarMapaRegistro();
  obtenerGPS();
  cargarContadorCabecera();
});


// -------------------------------------------------------------
// 4. NAVEGACIÓN ENTRE PESTAÑAS
// -------------------------------------------------------------

function mostrarSeccion(id, boton) {
  document.querySelectorAll('.seccion').forEach(function(s) {
    s.classList.remove('visible');
  });
  document.querySelectorAll('nav button').forEach(function(b) {
    b.classList.remove('activa');
  });
  document.getElementById(id).classList.add('visible');
  boton.classList.add('activa');

  if (id === 'avistamientos') {
    setTimeout(function() {
      iniciarMapaPublico();
      cargarAvistamientos();
    }, 100);
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

      document.getElementById('latitud').value  = miLatitud;
      document.getElementById('longitud').value = miLongitud;

      var texto = 'Ubicación obtenida: ' +
        miLatitud.toFixed(5) + ', ' + miLongitud.toFixed(5);
      mostrarEstadoGPS(texto, 'obtenido');

      actualizarMapaConPosicion(miLatitud, miLongitud);
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
  document.getElementById('gps-texto').textContent = texto;
  var punto = document.getElementById('gps-punto');
  punto.className = 'gps-punto';
  if (estado === 'obtenido') punto.classList.add('obtenido');
  if (estado === 'buscando') punto.classList.add('buscando');
}


// -------------------------------------------------------------
// 6. SELECTORES (ubicación y estado del mar)
// -------------------------------------------------------------

function seleccionar(grupoId, botonPulsado) {
  // Quitamos la selección de todos los botones del grupo
  var grupo = document.getElementById(grupoId);
  grupo.querySelectorAll('.selector-opcion').forEach(function(b) {
    b.classList.remove('seleccionado');
  });

  // Marcamos el botón pulsado
  botonPulsado.classList.add('seleccionado');

  // Guardamos el valor en el campo oculto correspondiente
  // El grupoId es 'selector-ubicacion' o 'selector-mar'
  // El campo oculto es 'ubicacion-carabela' o 'estado-mar'
  var campoId = grupoId === 'selector-ubicacion' ? 'ubicacion-carabela' : 'estado-mar';
  document.getElementById(campoId).value = botonPulsado.dataset.valor;
}


// -------------------------------------------------------------
// 7. MAPA DE REGISTRO
// -------------------------------------------------------------

function iniciarMapaRegistro() {
  mapaRegistro = L.map('mapa').setView([43.626177002883075, -5.876990546350287], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapaRegistro);
}

function actualizarMapaConPosicion(lat, lng) {
  mapaRegistro.setView([lat, lng], 15);

  if (marcadorUsuario) {
    mapaRegistro.removeLayer(marcadorUsuario);
  }

  marcadorUsuario = L.circleMarker([lat, lng], {
    radius: 10,
    fillColor: '#1a8ab5',
    color: '#0a4f6e',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.8
  }).addTo(mapaRegistro);

  marcadorUsuario.bindPopup('📍 Tu posición actual').openPopup();
}


// -------------------------------------------------------------
// 8. FOTO
// -------------------------------------------------------------

function previsualizarFoto(input) {
  var fichero = input.files[0];
  if (!fichero) return;

  fotoSeleccionada = fichero;

  var urlTemporal = URL.createObjectURL(fichero);
  var imagen = document.getElementById('vista-previa-foto');
  imagen.src = urlTemporal;
  imagen.style.display = 'block';
}


// -------------------------------------------------------------
// 9. ENVIAR AVISTAMIENTO
// -------------------------------------------------------------

async function enviarAvistamiento() {
  if (!miLatitud || !miLongitud) {
    mostrarError('Espera a que se obtenga la ubicación GPS.');
    return;
  }

  if (!fotoSeleccionada) {
    mostrarError('Por favor, añade una foto del avistamiento.');
    return;
  }

  var boton = document.getElementById('boton-enviar');
  boton.disabled = true;
  boton.textContent = 'Enviando...';

  try {
    // PASO 1: Subir la foto
    var nombreFoto = 'avistamiento_' + Date.now() + '_' + fotoSeleccionada.name;

    var { error: errorFoto } = await db
      .storage
      .from('fotos')
      .upload(nombreFoto, fotoSeleccionada);

    if (errorFoto) throw new Error('Error subiendo foto: ' + errorFoto.message);

    var { data: urlData } = db
      .storage
      .from('fotos')
      .getPublicUrl(nombreFoto);

    var fotoUrl = urlData.publicUrl;

    // PASO 2: Guardar en la base de datos
    var { error: errorDB } = await db
      .from('avistamientos')
      .insert({
        latitud:            miLatitud,
        longitud:           miLongitud,
        comentario:         document.getElementById('comentario').value,
        observador:         document.getElementById('observador').value,
        foto_url:           fotoUrl,
        ubicacion_carabela: document.getElementById('ubicacion-carabela').value,
        estado_mar:         document.getElementById('estado-mar').value,
        verificado:         false
      });

    if (errorDB) throw new Error('Error guardando datos: ' + errorDB.message);

    // PASO 3: Mostrar página de agradecimiento
    mostrarPaginaGracias();

  } catch (error) {
    mostrarError('Error al enviar: ' + error.message);
    boton.disabled = false;
    boton.textContent = 'Enviar avistamiento';
  }
}


// -------------------------------------------------------------
// 10. PÁGINA DE AGRADECIMIENTO
// -------------------------------------------------------------

async function mostrarPaginaGracias() {
  // Ocultamos el formulario y mostramos la página de gracias
  document.getElementById('pagina-formulario').style.display = 'none';
  document.getElementById('pagina-gracias').style.display = 'block';

  // Cargamos los contadores
  await cargarContadores();

  // Iniciamos el mapa de gracias con los avistamientos verificados
  setTimeout(function() {
    iniciarMapaGracias();
  }, 100);
}

async function cargarContadores() {
  try {
    // Contamos TODOS los avistamientos (recibidos)
    var { count: totalRecibidos } = await db
      .from('avistamientos')
      .select('*', { count: 'exact', head: true });

    // Contamos solo los verificados
    var { count: totalVerificados } = await db
      .from('avistamientos')
      .select('*', { count: 'exact', head: true })
      .eq('verificado', true);

    // Animamos el contador de recibidos subiendo
    animarContador('contador-recibidos', totalRecibidos || 0);
    animarContador('contador-verificados', totalVerificados || 0);

    // Actualizamos también el contador de la cabecera
    document.getElementById('header-total').textContent = totalRecibidos || 0;

  } catch (error) {
    console.log('Error cargando contadores:', error);
  }
}

// Anima un número subiendo desde 0 hasta el valor final
function animarContador(elementoId, valorFinal) {
  var elemento = document.getElementById(elementoId);
  var duracion = 1500; // milisegundos
  var inicio = Date.now();
  var valorInicial = 0;

  var intervalo = setInterval(function() {
    var transcurrido = Date.now() - inicio;
    var progreso = Math.min(transcurrido / duracion, 1);

    // Función de ease-out: empieza rápido y frena al final
    var eased = 1 - Math.pow(1 - progreso, 3);
    var valorActual = Math.round(valorInicial + (valorFinal - valorInicial) * eased);

    elemento.textContent = valorActual;

    if (progreso >= 1) {
      clearInterval(intervalo);
    }
  }, 16); // ~60 fps
}

function iniciarMapaGracias() {
  // Si el mapa ya existe, no lo creamos de nuevo
  if (mapaGracias) return;

  mapaGracias = L.map('mapa-gracias').setView([43.626177002883075, -5.876990546350287], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapaGracias);

  // Cargamos los puntos verificados en el mapa
  cargarPuntosEnMapa(mapaGracias);
}


// -------------------------------------------------------------
// 11. CARGAR CONTADOR EN LA CABECERA (al inicio)
// -------------------------------------------------------------

async function cargarContadorCabecera() {
  try {
    var { count } = await db
      .from('avistamientos')
      .select('*', { count: 'exact', head: true });

    document.getElementById('header-total').textContent = count || 0;
  } catch (error) {
    console.log('Error cargando contador:', error);
  }
}


// -------------------------------------------------------------
// 12. MAPA PÚBLICO (pestaña avistamientos)
// -------------------------------------------------------------

function iniciarMapaPublico() {
  if (mapaPublico) return;

  mapaPublico = L.map('mapa-publico').setView([43.5, -5.8], 9);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(mapaPublico);

  cargarPuntosEnMapa(mapaPublico);
}


// -------------------------------------------------------------
// 13. CARGAR PUNTOS VERIFICADOS EN UN MAPA
// -------------------------------------------------------------

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
      var popup =
        '<div style="max-width:200px">' +
        (a.foto_url ? '<img src="' + a.foto_url + '" style="width:100%;border-radius:6px;margin-bottom:6px">' : '') +
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
// 14. CARGAR LISTA DE AVISTAMIENTOS (pestaña avistamientos)
// -------------------------------------------------------------

async function cargarAvistamientos() {
  try {
    var { data: avistamientos, error } = await db
      .from('avistamientos')
      .select('*')
      .eq('verificado', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Contadores de la pestaña
    document.getElementById('total-avistamientos').textContent = avistamientos.length;

    var haceUnaSemana = new Date();
    haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);
    var estaSemana = avistamientos.filter(function(a) {
      return new Date(a.created_at) > haceUnaSemana;
    });
    document.getElementById('avistamientos-semana').textContent = estaSemana.length;

    // Lista
    var contenedor = document.getElementById('lista-avistamientos');

    if (avistamientos.length === 0) {
      contenedor.innerHTML = '<div class="cargando">No hay avistamientos verificados todavía.</div>';
      return;
    }

    contenedor.innerHTML = avistamientos.map(function(a) {
      var fecha = new Date(a.created_at).toLocaleDateString('es-ES', {
        day: 'numeric', month: 'long', year: 'numeric'
      });
      return '<div class="avistamiento-item">' +
        (a.foto_url
          ? '<img class="avistamiento-foto" src="' + a.foto_url + '" alt="Foto">'
          : '<div class="avistamiento-foto" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">🪼</div>'
        ) +
        '<div class="avistamiento-info">' +
          '<div class="avistamiento-fecha">' + fecha + '</div>' +
          '<div class="avistamiento-comentario">' + (a.comentario || 'Sin comentario') + '</div>' +
          '<div class="avistamiento-lugar">📍 ' + a.latitud.toFixed(4) + ', ' + a.longitud.toFixed(4) + '</div>' +
          (a.observador ? '<div class="avistamiento-lugar">— ' + a.observador + '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('');

  } catch (error) {
    document.getElementById('lista-avistamientos').innerHTML =
      '<div class="cargando">Error: ' + error.message + '</div>';
  }
}


// -------------------------------------------------------------
// 15. VOLVER A REGISTRAR
// -------------------------------------------------------------

function nuevoRegistro() {
  // Limpiamos el formulario
  document.getElementById('comentario').value = '';
  document.getElementById('observador').value = '';
  document.getElementById('input-foto').value = '';
  document.getElementById('vista-previa-foto').style.display = 'none';
  document.getElementById('error-registro').style.display = 'none';
  document.getElementById('ubicacion-carabela').value = '';
  document.getElementById('estado-mar').value = '';

  // Quitamos las selecciones de los botones
  document.querySelectorAll('.selector-opcion').forEach(function(b) {
    b.classList.remove('seleccionado');
  });

  fotoSeleccionada = null;
  document.getElementById('boton-enviar').disabled = false;
  document.getElementById('boton-enviar').textContent = 'Enviar avistamiento';

  // Volvemos a mostrar el formulario
  document.getElementById('pagina-gracias').style.display = 'none';
  document.getElementById('pagina-formulario').style.display = 'block';
}


// -------------------------------------------------------------
// 16. MOSTRAR ERROR
// -------------------------------------------------------------

function mostrarError(mensaje) {
  var div = document.getElementById('error-registro');
  div.textContent = mensaje;
  div.style.display = 'block';
  setTimeout(function() { div.style.display = 'none'; }, 5000);
}
