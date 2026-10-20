/* Verificação local RS256 com node-forge. Somente chaves públicas Google são buscadas. */
function decodeBase64Url_(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('base64url');
  var normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4) normalized += '=';
  return forge.util.decode64(normalized);
}
function jwtPart_(part) { return JSON.parse(forge.util.decodeUtf8(decodeBase64Url_(part))); }
function googleKeys_() {
  var cache = CacheService.getScriptCache();
  var stored = cache.get('google-jwks-v1');
  if (stored) return JSON.parse(stored);
  var response = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/certs', { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) fail_('AUTH_UNAVAILABLE', 'Não foi possível verificar o login com o Google. Tente novamente.');
  var keys = JSON.parse(response.getContentText()).keys;
  if (!Array.isArray(keys)) fail_('AUTH_UNAVAILABLE', 'Chaves públicas Google indisponíveis.');
  cache.put('google-jwks-v1', JSON.stringify(keys), 3600);
  return keys;
}
function authorize_(token) {
  if (typeof token !== 'string' || token.length > 12000 || token.split('.').length !== 3) fail_('UNAUTHORIZED', 'Entre novamente com sua conta Google.');
  var header, claims;
  try {
    var parts = token.split('.');
    header = jwtPart_(parts[0]);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('alg');
    var keys = googleKeys_();
    var jwk = keys.find(function(key) { return key.kid === header.kid && key.kty === 'RSA'; });
    if (!jwk) {
      CacheService.getScriptCache().remove('google-jwks-v1');
      jwk = googleKeys_().find(function(key) { return key.kid === header.kid && key.kty === 'RSA'; });
    }
    if (!jwk) throw new Error('kid');
    var clientId = properties_().getProperty('GOOGLE_CLIENT_ID');
    if (!clientId) fail_('CONFIG', 'Configure GOOGLE_CLIENT_ID no Apps Script.');
    // Restringe às chaves RSA Google usuais (expoente 65537), sem aceitar chaves do token.
    if (jwk.e !== 'AQAB') throw new Error('exponent');
    var modulus = new forge.jsbn.BigInteger(forge.util.bytesToHex(decodeBase64Url_(jwk.n)), 16);
    var publicKey = forge.pki.rsa.setPublicKey(modulus, new forge.jsbn.BigInteger('10001',16));
    var digest = forge.md.sha256.create(); digest.update(parts[0] + '.' + parts[1], 'utf8');
    if (!publicKey.verify(digest.digest().bytes(), decodeBase64Url_(parts[2]), 'RSASSA-PKCS1-V1_5', { parseAllDigestBytes: true })) throw new Error('signature');
    claims = jwtPart_(parts[1]);
    if (['https://accounts.google.com','accounts.google.com'].indexOf(claims.iss) === -1 || claims.aud !== clientId) throw new Error('aud/iss');
    if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > Date.now()/1000)) throw new Error('nbf');
    if (typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000 || (claims.email_verified !== true && claims.email_verified !== 'true') || !claims.sub || !claims.email) throw new Error('claims');
    if (claims.azp && claims.azp !== clientId) throw new Error('azp');
  } catch (error) {
    if (error.code === 'CONFIG' || error.code === 'AUTH_UNAVAILABLE') throw error;
    fail_('UNAUTHORIZED', 'Login inválido ou expirado. Entre novamente com sua conta Google.');
  }
  var email = String(claims.email).toLowerCase();
  var allowed = (properties_().getProperty('ALLOWED_EMAILS') || '').split(',').map(function(value) { return value.trim().toLowerCase(); }).filter(Boolean);
  if (allowed.indexOf(email) === -1) fail_('FORBIDDEN', 'Sua conta não está autorizada. Solicite acesso ao responsável pelo inventário.');
  return email;
}
