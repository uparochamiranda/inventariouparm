const config = window.INVENTARIO_CONFIG || {};
const pending = new Map();
let token = '';
export const configured = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.appsScriptUrl || '') && /^[\w.-]+\.apps\.googleusercontent\.com$/.test(config.googleClientId || '');
export function setCredential(value) { token = value || ''; }
export function signedIn() { return Boolean(token); }
export function trustedOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && !url.port && (url.hostname === 'script.googleusercontent.com' || /^[a-z0-9-]+-script\.googleusercontent\.com$/.test(url.hostname));
  } catch { return false; }
}
window.addEventListener('message', event => {
  if (!trustedOrigin(event.origin) || event.data?.channel !== 'inventario-ti-v1') return;
  const task = pending.get(event.data.requestId);
  if (!task) return;
  // Apps Script adiciona um iframe sandbox interno: source difere do iframe externo.
  // Origem Google + nonce aleatório de 256 bits vinculam a resposta ao POST.
  task.finish(event.data);
});
export async function api(action, data = {}) {
  if (!configured) throw new Error('Configure a URL do Apps Script e o Client ID Google em config.js.');
  if (!token) throw new Error('Entre com sua conta Google para continuar.');
  const requestToken = token;
  const requestId = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.name = `rpc_${requestId}`;
    frame.hidden = true;
    frame.title = 'Comunicação segura com o inventário';
    const form = document.createElement('form');
    form.method = 'POST'; form.action = config.appsScriptUrl; form.target = frame.name; form.hidden = true;
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = 'payload';
    input.value = JSON.stringify({ action, data, token, requestId, origin: location.origin });
    form.append(input);
    const cleanup = () => { clearTimeout(timer); pending.delete(requestId); form.remove(); frame.remove(); };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Sem confirmação do servidor. Consulte o código antes de repetir a gravação.'));
    }, config.requestTimeoutMs || 45000);
    pending.set(requestId, { finish(response) {
      cleanup();
      if (token !== requestToken) { reject(new Error('A sessão mudou. Atualize a consulta após entrar novamente.')); return; }
      if (response.ok) resolve(response.data);
      else {
        const error = new Error(response.error?.message || 'Falha na comunicação com a planilha.');
        error.code = response.error?.code; error.record = response.error?.record;
        if (error.code === 'UNAUTHORIZED') setCredential('');
        reject(error);
      }
    }});
    document.body.append(frame, form);
    form.submit();
  });
}
