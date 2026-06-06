// =============================================================
// app.js — Lógica principal de la app Physalia
// =============================================================


// -------------------------------------------------------------
// 1. CONFIGURACIÓN — CAMBIA ESTOS DOS VALORES POR LOS TUYOS
// -------------------------------------------------------------

const SUPABASE_URL = 'https://pssmplbphbdflxaynwfy.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gqhqYeYe3SnNKdp7ZujU5w_AfZu5YdI';

// Creamos la conexión con Supabase
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);


// -------------------------------------------------------------
// 2. VARIABLES GLOBALES
// -------------------------------------------------------------

let miLatitud = null; // Latitud GPS del usuario
let miLongitud = null; // Longitud GPS del usuario
let mapaRegistro = null; // El mapa del formulario
let mapaPublico = null; // El mapa de la pestaña avistamientos
let mapaGracias = null; // El mapa de la página de agradecimiento
let marcadorUsuario = null; // El punto en el mapa
let fotosSeleccionadas = [null, null, null]; // Las tres fotos posibles


// -------------------------------------------------------------
// 3. INICIO — Se ejecuta cuando la página termina de cargar
// -------------------------------------------------------------

window.addEventListener('load', function () {
    iniciarMapaRegistro();
    obtenerGPS();
    cargarContadorCabecera();
});


// -------------------------------------------------------------
// 4. NAVEGACIÓN ENTRE PESTAÑAS
// -------------------------------------------------------------

function mostrarSeccion(id, boton) {
    document.querySelectorAll('.seccion').forEach(function (s) {
        s.classList.remove('visible');
    });
    document.querySelectorAll('nav button').forEach(function (b) {
        b.classList.remove('activa');
    });
    document.getElementById(id).classList.add('visible');
    boton.classList.add('activa');

    if (id === 'avistamientos') {
        setTimeout(function () {
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
        function (posicion) {
            miLatitud = posicion.coords.latitude;
            miLongitud = posicion.coords.longitude;

            document.getElementById('latitud').value = miLatitud;
            document.getElementById('longitud').value = miLongitud;

            mostrarEstadoGPS('Ubicación obtenida', 'obtenido');
            mostrarCoordenadas(miLatitud, miLongitud);

            actualizarMapaConPosicion(miLatitud, miLongitud);
        },
        function (error) {
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

function mostrarCoordenadas(lat, lng) {
    var div = document.getElementById('gps-coordenadas');
    div.textContent = lat.toFixed(5) + ' N,  ' + lng.toFixed(5) + ' W';
    div.style.display = 'block';
}


// -------------------------------------------------------------
// 6. SELECTORES (ubicación del ejemplar)
// -------------------------------------------------------------

function seleccionar(grupoId, botonPulsado) {
    var grupo = document.getElementById(grupoId);
    grupo.querySelectorAll('.selector-opcion').forEach(function (b) {
        b.classList.remove('seleccionado');
    });
    botonPulsado.classList.add('seleccionado');
    var campoId = 'ubicacion-carabela';
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
    // Seleccionamos "En la arena" por defecto
    var botonArena = document.querySelector('#selector-ubicacion [data-valor="arena"]');
    seleccionar('selector-ubicacion', botonArena);
}

function actualizarMapaConPosicion(lat, lng) {
    mapaRegistro.setView([lat, lng], 15);

    if (marcadorUsuario) {
        mapaRegistro.removeLayer(marcadorUsuario);
    }

    marcadorUsuario = L.marker([lat, lng], {
        draggable: true
    }).addTo(mapaRegistro);

    marcadorUsuario.bindPopup('📍 Arrastra para ajustar la posición').openPopup();

    // Cuando el usuario arrastra el marcador, actualizamos las coordenadas
    marcadorUsuario.on('dragend', function () {
        var pos = marcadorUsuario.getLatLng();
        miLatitud = pos.lat;
        miLongitud = pos.lng;
        document.getElementById('latitud').value = miLatitud;
        document.getElementById('longitud').value = miLongitud;
        mostrarEstadoGPS('Posición ajustada', 'obtenido');
        mostrarCoordenadas(miLatitud, miLongitud);
    });

    // Al hacer clic en el mapa, el marcador se mueve ahí
    mapaRegistro.on('click', function (e) {
        miLatitud = e.latlng.lat;
        miLongitud = e.latlng.lng;
        marcadorUsuario.setLatLng([miLatitud, miLongitud]);
        document.getElementById('latitud').value = miLatitud;
        document.getElementById('longitud').value = miLongitud;
        mostrarEstadoGPS('Posición ajustada', 'obtenido');
        mostrarCoordenadas(miLatitud, miLongitud);
    });
}


// -------------------------------------------------------------
// 8. FOTOS — Tres slots estilo grid
// -------------------------------------------------------------

function abrirSelector(indice) {
    // Abre el input de fichero del slot correspondiente
    var slot = document.getElementById('slot-' + indice);
    slot.querySelector('input[type="file"]').click();
}

function previsualizarFoto(input, indice) {
    var fichero = input.files[0];
    if (!fichero) return;

    fotosSeleccionadas[indice] = fichero;

    var urlTemporal = URL.createObjectURL(fichero);
    var slot = document.getElementById('slot-' + indice);

    slot.innerHTML =
        '<img src="' + urlTemporal + '" alt="Foto ' + (indice + 1) + '">' +
        '<button class="foto-borrar" onclick="borrarFoto(event, ' + indice + ')">✕</button>' +
        '<input type="file" accept="image/*" ' +
        'onchange="previsualizarFoto(this, ' + indice + ')" style="display:none">';

    // Activamos el siguiente slot si existe
    var siguiente = document.getElementById('slot-' + (indice + 1));
    if (siguiente) {
        siguiente.classList.remove('desactivado');
    }

    // Ocultamos el aviso y reseteamos el botón
    document.getElementById('aviso-sin-foto').style.display = 'none';
    var boton = document.getElementById('boton-enviar');
    boton.textContent = 'Enviar avistamiento';
    boton.dataset.intentado = 'false';
}

function borrarFoto(evento, indice) {
    evento.stopPropagation();

    fotosSeleccionadas[indice] = null;

    var slot = document.getElementById('slot-' + indice);
    slot.innerHTML =
        '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
        '<input type="file" accept="image/*" ' +
        'onchange="previsualizarFoto(this, ' + indice + ')" style="display:none">';

    // Desactivamos y limpiamos los slots siguientes
    for (var i = indice + 1; i < 3; i++) {
        fotosSeleccionadas[i] = null;
        var slotSiguiente = document.getElementById('slot-' + i);
        slotSiguiente.classList.add('desactivado');
        slotSiguiente.innerHTML =
            '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
            '<input type="file" accept="image/*" ' +
            'onchange="previsualizarFoto(this, ' + i + ')" style="display:none">';
    }
}

function resetearFotos() {
    fotosSeleccionadas = [null, null, null];
    for (var i = 0; i < 3; i++) {
        var slot = document.getElementById('slot-' + i);
        slot.classList.remove('desactivado');
        if (i > 0) slot.classList.add('desactivado');
        slot.innerHTML =
            '<div class="foto-placeholder"><i class="ph ph-camera"></i></div>' +
            '<input type="file" accept="image/*" ' +
            'onchange="previsualizarFoto(this, ' + i + ')" style="display:none">';
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

    // Si no hay ninguna foto, mostramos el popup recordatorio
    var hayFoto = fotosSeleccionadas.some(function (f) { return f !== null; });
    if (!hayFoto) {
        // Primera vez: avisamos y cambiamos el botón
        var boton = document.getElementById('boton-enviar');
        if (boton.dataset.intentado !== 'true') {
            boton.textContent = 'Enviar sin fotos';
            boton.dataset.intentado = 'true';
            document.getElementById('aviso-sin-foto').style.display = 'block';
            return;
        }
        // Segunda vez: envían sin fotos
    }

    var boton = document.getElementById('boton-enviar');
    boton.disabled = true;
    boton.textContent = 'Enviando...';

    try {
        // PASO 1: Subir las fotos que haya (pueden ser 0, 1, 2 o 3)
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
                latitud: miLatitud,
                longitud: miLongitud,
                comentario: document.getElementById('comentario').value,
                observador: document.getElementById('observador').value,
                foto_url: fotosUrls[0],
                foto_url2: fotosUrls[1],
                foto_url3: fotosUrls[2],
                ubicacion_carabela: document.getElementById('ubicacion-carabela').value,
                verificado: false
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
// 10. ENVIAR SIN FOTO
// -------------------------------------------------------------

async function enviarSinFoto() {
    // Cerramos el popup
    document.getElementById('aviso-foto').style.display = 'none';
    // Marcamos todas las fotos como 'ninguna' para que no vuelva a preguntar
    fotosSeleccionadas = ['ninguna', null, null];
    await enviarAvistamiento();
    fotosSeleccionadas = [null, null, null];
}


// -------------------------------------------------------------
// 11. PÁGINA DE AGRADECIMIENTO
// -------------------------------------------------------------

async function mostrarPaginaGracias() {
    document.getElementById('pagina-formulario').style.display = 'none';
    document.getElementById('pagina-gracias').style.display = 'block';

    await cargarContadores();

    setTimeout(function () {
        iniciarMapaGracias();
    }, 100);
}

async function cargarContadores() {
    try {
        // Total de avistamientos recibidos
        var { count: totalRecibidos } = await db
            .from('avistamientos')
            .select('*', { count: 'exact', head: true });

        // Solo los verificados
        var { count: totalVerificados } = await db
            .from('avistamientos')
            .select('*', { count: 'exact', head: true })
            .eq('verificado', true);

        animarContador('contador-recibidos', totalRecibidos || 0);
        animarContador('contador-verificados', totalVerificados || 0);

        document.getElementById('header-total').textContent = totalRecibidos || 0;

    } catch (error) {
        console.log('Error cargando contadores:', error);
    }
}

// Anima un número subiendo desde 0 hasta el valor final
function animarContador(elementoId, valorFinal) {
    var elemento = document.getElementById(elementoId);
    var duracion = 1500;
    var inicio = Date.now();

    var intervalo = setInterval(function () {
        var transcurrido = Date.now() - inicio;
        var progreso = Math.min(transcurrido / duracion, 1);
        // Ease-out: empieza rápido y frena al final
        var eased = 1 - Math.pow(1 - progreso, 3);
        elemento.textContent = Math.round(valorFinal * eased);
        if (progreso >= 1) clearInterval(intervalo);
    }, 16);
}

function iniciarMapaGracias() {
    if (mapaGracias) return;

    mapaGracias = L.map('mapa-gracias').setView([43.626177002883075, -5.876990546350287], 9);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(mapaGracias);

    cargarPuntosEnMapa(mapaGracias);
}


// -------------------------------------------------------------
// 12. CONTADOR EN LA CABECERA
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
// 13. MAPA PÚBLICO (pestaña avistamientos)
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
// 14. CARGAR PUNTOS VERIFICADOS EN UN MAPA
// -------------------------------------------------------------

async function cargarPuntosEnMapa(mapa) {
    try {
        var { data: avistamientos } = await db
            .from('avistamientos')
            .select('*')
            .eq('verificado', true)
            .order('created_at', { ascending: false });

        if (!avistamientos || avistamientos.length === 0) return;

        avistamientos.forEach(function (a) {
            var marcador = L.circleMarker([a.latitud, a.longitud], {
                radius: 8,
                fillColor: '#00c2b8',
                color: '#0a4f6e',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(mapa);

            var fecha = new Date(a.created_at).toLocaleDateString('es-ES');

            // Mostramos hasta 3 fotos en el popup si las hay
            var fotos = [a.foto_url, a.foto_url2, a.foto_url3]
                .filter(function (f) { return f; })
                .map(function (f) {
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
// 15. LISTA DE AVISTAMIENTOS (pestaña avistamientos)
// -------------------------------------------------------------

async function cargarAvistamientos() {
    try {
        var { data: avistamientos, error } = await db
            .from('avistamientos')
            .select('*')
            .eq('verificado', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        document.getElementById('total-avistamientos').textContent = avistamientos.length;

        var haceUnaSemana = new Date();
        haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);
        var estaSemana = avistamientos.filter(function (a) {
            return new Date(a.created_at) > haceUnaSemana;
        });
        document.getElementById('avistamientos-semana').textContent = estaSemana.length;

        var contenedor = document.getElementById('lista-avistamientos');

        if (avistamientos.length === 0) {
            contenedor.innerHTML = '<div class="cargando">No hay avistamientos verificados todavía.</div>';
            return;
        }

        contenedor.innerHTML = avistamientos.map(function (a) {
            var fecha = new Date(a.created_at).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric'
            });

            // Primera foto disponible para la miniatura de la lista
            var fotoLista = a.foto_url || a.foto_url2 || a.foto_url3;

            return '<div class="avistamiento-item">' +
                (fotoLista
                    ? '<img class="avistamiento-foto" src="' + fotoLista + '" alt="Foto">'
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
// 16. VOLVER A REGISTRAR
// -------------------------------------------------------------

function nuevoRegistro() {
  document.getElementById('comentario').value = '';
  document.getElementById('observador').value = '';
  document.getElementById('error-registro').style.display = 'none';
  document.getElementById('ubicacion-carabela').value = '';
  document.getElementById('aviso-sin-foto').style.display = 'none';

  document.querySelectorAll('.selector-opcion').forEach(function(b) {
    b.classList.remove('seleccionado');
  });

  // Seleccionamos "En la arena" por defecto
  var botonArena = document.querySelector('#selector-ubicacion [data-valor="arena"]');
  seleccionar('selector-ubicacion', botonArena);

  // Reseteamos fotos
  resetearFotos();

  // Reseteamos el botón
  var boton = document.getElementById('boton-enviar');
  boton.disabled = false;
  boton.textContent = 'Enviar avistamiento';
  boton.dataset.intentado = 'false';

  document.getElementById('pagina-gracias').style.display = 'none';
  document.getElementById('pagina-formulario').style.display = 'block';
}


// -------------------------------------------------------------
// 17. MOSTRAR ERROR
// -------------------------------------------------------------

function mostrarError(mensaje) {
    var div = document.getElementById('error-registro');
    div.textContent = mensaje;
    div.style.display = 'block';
    setTimeout(function () { div.style.display = 'none'; }, 5000);
}
