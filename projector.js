let canalTransmision;
let lienzo;

function setup() {
  // Lienzo HD para el proyector
  createCanvas(windowWidth, windowHeight);
  
  // Usaremos un buffer gráfico para que el dibujo sea persistente
  lienzo = createGraphics(width, height);
  lienzo.background(0); // Fondo negro puro
  
  canalTransmision = new BroadcastChannel('canal_laser');
  
  canalTransmision.onmessage = (event) => {
    let msg = event.data;
    if (msg.tipo === 'linea') {
      // Recibir y des-normalizar coordenadas suavizadas
      dibujarBrochaGraffiti(
        msg.px * width, 
        msg.py * height, 
        msg.x * width, 
        msg.y * height, 
        color(msg.r, msg.g, msg.b), 
        msg.grosor
      );
    } else if (msg.tipo === 'limpiar') {
      lienzo.background(0);
    }
  };
}

function draw() {
  // Dibujar el buffer en la pantalla principal en cada frame
  image(lienzo, 0, 0);
}

// ==========================================
// LA FUNCIÓN DEL GRAFFITI DIGITAL
// ==========================================
function dibujarBrochaGraffiti(fromX, fromY, toX, toY, colorEstilo, grosorBase) {
  lienzo.noStroke();
  
  // 1. Configuramos el color con ALPHA BAJO (la clave del aerosol)
  // Al tener transparencia (e.g., 20 de 255), el color se acumula si pasas lento.
  let colorGota = color(red(colorEstilo), green(colorEstilo), blue(colorEstilo), 90);
  lienzo.fill(colorGota);
  
  // 2. Calculamos cuántas "paradas" haremos entre el punto A y B
  let distancia = dist(fromX, fromY, toX, toY);
  
  // Si nos movemos rápido, hay menos gotas (dispersión); lento, más gotas (goteo).
  // Ajustamos los pasos basándonos en la distancia.
  let pasos = map(distancia, 0, 50, 1, 5); 
  
  // Configuramos la dispersión basándonos en el potenciómetro (grosor)
  let dispersion = grosorBase / 2;
  
  // Por cada paso en la línea, dibujamos un grupo de gotitas
  for (let i = 0; i <= pasos; i++) {
    let pct = i / pasos;
    let centroX = lerp(fromX, toX, pct);
    let centroY = lerp(fromY, toY, pct);
    
    // 3. Crear el efecto "Spray" (dibujar puntos aleatorios Gaussianos)
    // Dibujamos e.g., 15 gotas por parada.
    let numGotas = 50;
    for (let g = 0; g < numGotas; g++) {
      // randomGaussian() hace que haya más gotas en el centro y menos en los bordes
      let gotitaX = randomGaussian(centroX, dispersion*0.8);
      let gotitaY = randomGaussian(centroY, dispersion*0.8);
      
      // Tamaño de la gota aleatorio
      let tamañoGota = random(1, 3);
      
      lienzo.ellipse(gotitaX, gotitaY, tamañoGota, tamañoGota);
    }
  }
}

// Ajustar lienzo si cambia el tamaño de ventana
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  let nuevoLienzo = createGraphics(width, height);
  nuevoLienzo.background(0);
  nuevoLienzo.image(lienzo, 0, 0);
  lienzo = nuevoLienzo;
}