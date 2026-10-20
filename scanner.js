let controls;
let generation = 0;
let loading;
function loadReader() {
  if (window.ZXingBrowser) return Promise.resolve();
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('./vendor/zxing-browser.min.js', import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => { loading = null; script.remove(); reject(new Error('Não foi possível carregar o leitor. Use a digitação manual.')); };
    document.head.append(script);
  });
  return loading;
}
export function stopScanner(video) {
  generation++;
  controls?.stop(); controls = null;
  video.srcObject?.getTracks().forEach(track => track.stop());
  video.srcObject = null;
}
export async function createBarcodeReader() {
  await loadReader();
  const { BrowserMultiFormatReader } = window.ZXingBrowser;
  const reader = new BrowserMultiFormatReader(undefined, { delayBetweenScanAttempts: 180 });
  // DecodeHintType.TRY_HARDER = 3 na biblioteca ZXing incluída no projeto.
  const precise = new BrowserMultiFormatReader(new Map([[3, true]]));
  const decode = reader.decodeFromCanvas.bind(reader);
  const canvas = document.createElement('canvas');
  const angles = [10, -10, 20, -20, 90, 0];
  let attempt = 0;
  reader.decodeFromCanvas = source => {
    try { return decode(source); } catch (originalError) {
      // Uma tentativa adicional por quadro mantém a interface utilizável.
      // A imagem completa é preservada, incluindo as margens do código.
      const angle = angles[attempt++ % angles.length] * Math.PI / 180;
      const cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle));
      canvas.width = Math.ceil(source.width * cos + source.height * sin) + 24;
      canvas.height = Math.ceil(source.width * sin + source.height * cos) + 24;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.translate(canvas.width / 2, canvas.height / 2); context.rotate(angle);
      context.drawImage(source, -source.width / 2, -source.height / 2);
      try { return precise.decodeFromCanvas(canvas); } catch { throw originalError; }
    }
  };
  return reader;
}
export async function startScanner(video, onCode) {
  const currentGeneration = ++generation;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Câmera indisponível. Use HTTPS ou digite o código manualmente.');
  const reader = await createBarcodeReader();
  if (generation !== currentGeneration) return;
  let detected = false;
  const scanner = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } }, video, (result, error, localControls) => {
    if (!result || detected || generation !== currentGeneration) return;
    detected = true;
    localControls.stop();
    navigator.vibrate?.(100);
    onCode(result.getText());
  });
  if (generation !== currentGeneration || detected) scanner.stop();
  else {
    controls = scanner;
    const track = video.srcObject?.getVideoTracks()[0];
    try {
      if (track?.getCapabilities?.().focusMode?.includes('continuous')) {
        await track.applyConstraints({ ...track.getConstraints(), advanced: [{ focusMode: 'continuous' }] });
      }
    } catch { /* Foco opcional: o leitor funciona mesmo sem controle de foco. */ }
  }
}
