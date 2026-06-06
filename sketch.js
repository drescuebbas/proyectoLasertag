let r, g, b;
let ws;
let valorPot = 0;
let canalTransmision;
let video;
let vistaDemarcada;
let bufferVideo;
let mascara;
let colorObjetivo = [255, 0, 0];
let vAncho = 320;
let vAlto = 240;
let pLaserX = 0;
let pLaserY = 0;
let laserDetectadoAnterior = false;
let lienzoLocal;
let modoRendimiento = false; // Controla si dibujamos los monitores o no
let esquinas = [
  { x: 20, y: 20 },
  { x: 300, y: 20 },
  { x: 300, y: 220 },
  { x: 20, y: 220 }
];
let arrastrando = -1; 
let mapCamX;
let mapCamY;
let mapaActualizado = false; // Nos dirá cuándo hay que recalcular
let smoothLaserX = 0;
let smoothLaserY = 0;
let factorSuavizado = 0.9; // menor: mas suave, mas lag. mayor: mas rapido pero mas tembloroso
function setup() {
  let canvas = createCanvas(windowWidth, windowHeight - 150);
  canvas.parent(document.getElementById('lienzo-container'));
  
  vistaDemarcada = createImage(vAncho, vAlto);
  mascara = createImage(vAncho, vAlto);
  lienzoLocal = createGraphics(width, height);
  lienzoLocal.background(30);

  // NUEVO: Creamos el buffer con el tamaño exacto y ligero
  bufferVideo = createGraphics(vAncho, vAlto);
  
  // 🔥 EL FIX MÁGICO: Forzar la densidad a 1 para que la matemática no se rompa
  bufferVideo.pixelDensity(1);

  // Inicializar memoria rápida para el LUT
  mapCamX = new Int32Array(vAncho * vAlto);
  mapCamY = new Int32Array(vAncho * vAlto);

  video = createCapture(VIDEO);
  video.hide(); 
  
  nuevoColor();
  cargarAjustes();
  conectarESP32();
  canalTransmision = new BroadcastChannel('canal_laser');
}

function draw() {
  background(1);
  
  if (!mapaActualizado) {
    calcularMapaPuntos();
    mapaActualizado = true;
  }

  procesarTrackingPlano();

  if (!modoRendimiento) {
    image(video, 10, 10, vAncho, vAlto);
    image(vistaDemarcada, vAncho + 20, 10, vAncho, vAlto);
    image(mascara, (vAncho * 2) + 30, 10, vAncho, vAlto);

    push();
    translate(10, 10);
    stroke(0, 255, 0); strokeWeight(2); noFill();
    quad(esquinas[0].x, esquinas[0].y, esquinas[1].x, esquinas[1].y, esquinas[2].x, esquinas[2].y, esquinas[3].x, esquinas[3].y);
    fill(0, 255, 0, 150);
    for (let i = 0; i < esquinas.length; i++) ellipse(esquinas[i].x, esquinas[i].y, 15, 15);
    pop();

    // Muestra de color
    // fill(colorObjetivo); stroke(255); strokeWeight(1);
    // rect(15, 15, 30, 30);
    // Cuadro de muestra del color objetivo (El color de tu láser físico)
    fill(colorObjetivo); stroke(255); strokeWeight(1);
    rect(15, 15, 30, 30);

    // NUEVO: Indicador de la brocha dinámica (Lo que verá el proyector)
    let grosorBrocha = map(valorPot, 0, 4095, 10, 50); // Calculamos el tamaño con el ESP32
    fill(r, g, b); // Usamos el color actual de tu brocha (el que cambia con la 'R')
    noStroke(); // Le quitamos el borde para que parezca una mancha de pintura
    ellipse(80, 30, grosorBrocha, grosorBrocha); // Lo dibujamos como un punto perfecto al lado del cuadro

    // ETIQUETAS
    fill(255); noStroke(); textSize(12); textFont('monospace');
    text("1. CÁMARA ORIGINAL", 10, vAlto + 30);
    text("2. ZONA DEMARCADA (PLANA)", vAncho + 20, vAlto + 30);
    text("3. MÁSCARA DEL LÁSER", (vAncho * 2) + 30, vAlto + 30);
    text("Pulsa 'M' para activar MODO RENDIMIENTO (Quita el lag para dibujar)", 10, vAlto + 50);

  } else {
    // Pantalla de Modo Rendimiento
    fill(0, 255, 0); noStroke(); textSize(18); textFont('monospace');
    text("🚀 MODO RENDIMIENTO ACTIVADO", 20, 40);
    fill(200); textSize(14);
    text("Las cámaras están ocultas para evitar el lag.", 20, 65);
    text("El programa sigue rastreando el láser a máxima resolución.", 20, 85);
    text("Pulsa 'M' para volver a ver las cámaras y calibrar.", 20, 115);
  }

  // PREVISUALIZACIÓN DEL LIENZO (Esto se dibuja siempre)
  let offsetY = modoRendimiento ? 150 : vAlto + 75;
  fill(255); noStroke(); textSize(12);
  text("4. PREVISUALIZACIÓN DEL LIENZO", 10, offsetY - 10);
  let prevW = (vAncho * 3) + 20; 
  let prevH = (prevW * height) / width; 
  image(lienzoLocal, 10, offsetY, prevW, prevH);
  noFill(); stroke(100); strokeWeight(1);
  rect(10, offsetY, prevW, prevH);

  actualizarDOM();
}
function calcularMapaPuntos() {
  let index = 0;
  for (let y = 0; y < vAlto; y++) {
    let v = y / (vAlto - 1);
    for (let x = 0; x < vAncho; x++) {
      let u = x / (vAncho - 1);
      
      let topX = lerp(esquinas[0].x, esquinas[1].x, u);
      let topY = lerp(esquinas[0].y, esquinas[1].y, u);
      let botX = lerp(esquinas[3].x, esquinas[2].x, u);
      let botY = lerp(esquinas[3].y, esquinas[2].y, u);

      let camX = floor(lerp(topX, botX, v));
      let camY = floor(lerp(topY, botY, v));

      mapCamX[index] = constrain(camX, 0, vAncho - 1);
      mapCamY[index] = constrain(camY, 0, vAlto - 1);
      index++;
    }
  }
}

function procesarTrackingPlano() {
  // MAGIA: La tarjeta gráfica achica el video al instante antes de que JavaScript lo toque
  bufferVideo.image(video, 0, 0, vAncho, vAlto);
  bufferVideo.loadPixels();
  
  if (!modoRendimiento) {
    vistaDemarcada.loadPixels();
    mascara.loadPixels();
  }
  
  // Ahora leemos desde bufferVideo.pixels, que siempre será pequeño y súper rápido
  if (bufferVideo.pixels.length > 0) {
    let umbral = document.getElementById('umbral').value;
    let umbralRapido = umbral * 3; 
    
    let sumaX = 0; let sumaY = 0; let contadorPixeles = 0;

    for (let y = 0; y < vAlto; y++) {
      for (let x = 0; x < vAncho; x++) {
        
        let mapIndex = x + y * vAncho;
        let camX = mapCamX[mapIndex];
        let camY = mapCamY[mapIndex];

        let vIndex = (camX + camY * vAncho) * 4;
        
        // Sacamos los colores del BUFFER, no del video
        let vr = bufferVideo.pixels[vIndex];
        let vg = bufferVideo.pixels[vIndex+1];
        let vb = bufferVideo.pixels[vIndex+2];

        // Distancia Manhattan ultrarrápida
        let diferencia = Math.abs(vr - colorObjetivo[0]) + Math.abs(vg - colorObjetivo[1]) + Math.abs(vb - colorObjetivo[2]);

        if (!modoRendimiento) {
          let dIndex = (x + y * vAncho) * 4;
          vistaDemarcada.pixels[dIndex] = vr;
          vistaDemarcada.pixels[dIndex+1] = vg;
          vistaDemarcada.pixels[dIndex+2] = vb;
          vistaDemarcada.pixels[dIndex+3] = 255;

          if (diferencia < umbralRapido) {
            mascara.pixels[dIndex] = 255; mascara.pixels[dIndex+1] = 255; mascara.pixels[dIndex+2] = 255; mascara.pixels[dIndex+3] = 255;
          } else {
            mascara.pixels[dIndex] = 0; mascara.pixels[dIndex+1] = 0; mascara.pixels[dIndex+2] = 0; mascara.pixels[dIndex+3] = 255;
          }
        }

        if (diferencia < umbralRapido) {
          sumaX += x; sumaY += y; contadorPixeles++;
        }
      }
    }
    
    if (!modoRendimiento) {
      vistaDemarcada.updatePixels();
      mascara.updatePixels();
    }

    if (contadorPixeles > 10) {
      let centroX = sumaX / contadorPixeles;
      let centroY = sumaY / contadorPixeles;
      
      let laserX = map(centroX, 0, vAncho, 0, width);
      let laserY = map(centroY, 0, vAlto, 0, height);

      dibujarYTransmitir(laserX, laserY);
    } else {
      laserDetectadoAnterior = false;
    }
  }
}

function dibujarYTransmitir(x, y) {
  let grosor = map(valorPot, 0, 4095, 10, 50);

  if (laserDetectadoAnterior) {
    // 🚀 APLICAR SUAVIZADO (Math lerp)
    // En lugar de ir directo a (x,y), nos acercamos un 20% (factorSuavizado) en cada frame.
    smoothLaserX = lerp(pLaserX, x, factorSuavizado);
    smoothLaserY = lerp(pLaserY, y, factorSuavizado);

    // Dibujar previsualización local sencilla (para no gastar CPU aquí)
    lienzoLocal.stroke(r, g, b);
    lienzoLocal.strokeWeight(map(grosor, 10, 50, 1, 5)); // Previsualización fina
    lienzoLocal.line(pLaserX, pLaserY, smoothLaserX, smoothLaserY);

    // Enviar las coordenadas YA SUAVIZADAS al proyector
    canalTransmision.postMessage({
      tipo: 'linea', 
      px: pLaserX / width, 
      py: pLaserY / height, 
      x: smoothLaserX / width, 
      y: smoothLaserY / height, 
      r: r, g: g, b: b, 
      grosor: grosor
    });
    
    // Actualizar punto anterior con el punto suavizado
    pLaserX = smoothLaserX;
    pLaserY = smoothLaserY;
  } else {
    // Si es el primer punto detectado, inicializamos sin suavizar para no hacer una línea loca
    pLaserX = x;
    pLaserY = y;
    smoothLaserX = x;
    smoothLaserY = y;
  }

  laserDetectadoAnterior = true;
}

function mousePressed() {
  let mx = mouseX - 10;
  let my = mouseY - 10;

  for (let i = 0; i < esquinas.length; i++) {
    if (dist(mx, my, esquinas[i].x, esquinas[i].y) < 15) {
      arrastrando = i;
      return; 
    }
  }
  
  // Si hacemos clic en la cámara, sacamos el color del BUFFER optimizado
  if (mx >= 0 && mx < vAncho && my >= 0 && my < vAlto) {
    // Usamos la función nativa get() que es súper segura
    let colorSeleccionado = bufferVideo.get(mx, my); 
    
    colorObjetivo[0] = colorSeleccionado[0];
    colorObjetivo[1] = colorSeleccionado[1];
    colorObjetivo[2] = colorSeleccionado[2];
  }
}

function mouseDragged() {
  if (arrastrando !== -1) {
    esquinas[arrastrando].x = constrain(mouseX - 10, 0, vAncho);
    esquinas[arrastrando].y = constrain(mouseY - 10, 0, vAlto);
    mapaActualizado = false; // Le avisa a draw() que debe recalcular la memoria
  }
}

function mouseReleased() {
  arrastrando = -1;
}

function conectarESP32() {
  ws = new WebSocket("ws://172.20.10.3:81");
  ws.onopen = () => { let e = document.getElementById('val-estado'); if(e){e.innerText = "Conectado"; e.style.color="#00ff00";} };
  ws.onclose = () => { let e = document.getElementById('val-estado'); if(e){e.innerText = "NO CONECTADO"; e.style.color="#ff0000";} };
  ws.onerror = (e) => console.error("Error WebSocket:", e);
  ws.onmessage = (event) => { let raw = event.data.trim(); if (raw !== "") valorPot = int(raw); };
}

function nuevoColor() { r = random(255); g = random(255); b = random(255); }

function keyPressed() { 
  if (key === 'r' || key === 'R') { 
    nuevoColor(); 
    lienzoLocal.background(30); 
    canalTransmision.postMessage({ tipo: 'limpiar' }); 
  }
  // Alternar el Modo Rendimiento
  if (key === 'm' || key === 'M') {
    modoRendimiento = !modoRendimiento;
  }
}

function actualizarDOM() {
  let p = document.getElementById('val-pot'); let c = document.getElementById('val-rgb');
  if (p) p.innerText = int(valorPot); if (c) c.innerText = int(r) + ", " + int(g) + ", " + int(b);
}

function guardarAjustes() {
  let ajustes = {
    esquinas: esquinas,
    colorObjetivo: colorObjetivo,
    umbral: document.getElementById('umbral').value
  };
  localStorage.setItem('laserTagPreset', JSON.stringify(ajustes));
  alert("preset guardado.");
}

function cargarAjustes() {
  let memoria = localStorage.getItem('laserTagPreset');
  
  if (memoria) {
    let ajustes = JSON.parse(memoria);
    
    esquinas = ajustes.esquinas;
    colorObjetivo = ajustes.colorObjetivo;
    document.getElementById('umbral').value = ajustes.umbral;
    mapaActualizado = false; 
    console.log("preset cargado.");
  }
}

function borrarAjustes() {
  if (confirm("esto borrará el preset guardado.")) {
    localStorage.removeItem('laserTagPreset');
    location.reload();
  }
}