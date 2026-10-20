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
export async function startScanner(video, onCode) {
  const currentGeneration = ++generation;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Câmera indisponível. Use HTTPS ou digite o código manualmente.');
  await loadReader();
  if (generation !== currentGeneration) return;
  let detected = false;
  const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
  const scanner = await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } }, video, (result, error, localControls) => {
    if (!result || detected || generation !== currentGeneration) return;
    detected = true;
    localControls.stop();
    navigator.vibrate?.(100);
    onCode(result.getText());
  });
  if (generation !== currentGeneration || detected) scanner.stop();
  else controls = scanner;
}
