/* Inventário TI — Google Sheets é a única fonte de dados. */
var SCHEMA_ = {
  INVENTARIO: ['ID','DATA','HORA','CODIGO_BARRAS','PATRIMONIO','SETOR','TIPO','FABRICANTE','MODELO','OBSERVACAO'],
  SETORES: ['ID','NOME_SETOR','ATIVO'],
  TIPOS: ['ID','NOME_TIPO','ATIVO'],
  MODELOS: ['ID','TIPO','FABRICANTE','MODELO','ATIVO']
};
var DEFAULT_TYPES_ = ['Desktop','Notebook','Monitor','Impressora','Scanner','Nobreak','Switch','Roteador','Access Point','Servidor','Televisão','Totem','Outros'];
var cachedSpreadsheet_ = null;
function fail_(code, message, record) {
  var error = new Error(message); error.code = code; error.record = record; throw error;
}
function properties_() {
  var properties = PropertiesService.getScriptProperties();
  // Somente valores fixos definidos pelo responsável no código publicado.
  // Requisições HTTP nunca podem fornecer ou alterar a configuração do servidor.
  if (typeof DEPLOYMENT_DEFAULTS_ === 'object') {
    var missing = {};
    Object.keys(DEPLOYMENT_DEFAULTS_).forEach(function(key) {
      if (!properties.getProperty(key)) missing[key] = DEPLOYMENT_DEFAULTS_[key];
    });
    if (Object.keys(missing).length) properties.setProperties(missing, false);
  }
  return properties;
}
function spreadsheet_() {
  var id = properties_().getProperty('SPREADSHEET_ID');
  if (!id) fail_('CONFIG', 'Configure SPREADSHEET_ID nas propriedades do script.');
  if (!cachedSpreadsheet_) cachedSpreadsheet_ = SpreadsheetApp.openById(id);
  return cachedSpreadsheet_;
}
function sheet_(name) {
  var sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) fail_('SCHEMA', 'Execute setupInventory_ no editor para preparar as abas.');
  var headers = sheet.getRange(1, 1, 1, SCHEMA_[name].length).getDisplayValues()[0];
  if (JSON.stringify(headers) !== JSON.stringify(SCHEMA_[name])) fail_('SCHEMA', 'Cabeçalhos inválidos na aba ' + name + '.');
  return sheet;
}
function records_(name) {
  var sheet = sheet_(name);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, SCHEMA_[name].length).getDisplayValues().map(function(row, index) {
    var record = { _row: index + 2 };
    SCHEMA_[name].forEach(function(key, i) { record[key] = row[i]; });
    return record;
  }).filter(function(record) { return record.ID; });
}
function publicRecord_(record) {
  if (!record) return null;
  var copy = Object.assign({}, record); delete copy._row;
  if (copy.CODIGO_BARRAS !== undefined) copy._version = version_(record);
  return copy;
}
function version_(record) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    JSON.stringify(SCHEMA_.INVENTARIO.map(function(k) { return record[k]; }))));
}
function text_(value, name, max, optional) {
  if (typeof value !== 'string') { if (optional && (value === undefined || value === null)) return ''; fail_('VALIDATION', name + ' inválido.'); }
  var cleaned = value.trim();
  if ((!cleaned && !optional) || cleaned.length > max || /[\u0000-\u0008\u000B-\u001F\u007F]/.test(cleaned)) fail_('VALIDATION', name + ' inválido (máximo ' + max + ' caracteres).');
  return cleaned;
}
function key_(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' '); }
function codeKey_(value) { return String(value || '').trim().toUpperCase(); }
function active_(record) { return record && String(record.ATIVO).toUpperCase() === 'SIM'; }
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) fail_('BUSY', 'Planilha ocupada. Aguarde alguns segundos e consulte o código antes de tentar novamente.');
  try { return fn(); } finally { lock.releaseLock(); }
}
function writeRow_(name, row, values) {
  var sheet = sheet_(name);
  if (row > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), Math.max(100, row - sheet.getMaxRows()));
  // Apóstrofo protege fórmulas e mantém códigos com zeros à esquerda.
  var safe = values.map(function(value) { return "'" + String(value); });
  var range = sheet.getRange(row, 1, 1, values.length);
  range.setNumberFormat('@'); range.setValues([safe]);
  SpreadsheetApp.flush();
  var saved = range.getDisplayValues()[0];
  if (JSON.stringify(saved) !== JSON.stringify(values.map(String))) fail_('WRITE_UNCONFIRMED', 'Gravação sem confirmação. Consulte o código antes de repetir.');
  var result = { _row: row };
  SCHEMA_[name].forEach(function(k, i) { result[k] = saved[i]; });
  return publicRecord_(result);
}
function catalogs_() {
  return { setores: records_('SETORES').map(publicRecord_), tipos: records_('TIPOS').map(publicRecord_), modelos: records_('MODELOS').map(publicRecord_) };
}
function find_(data) {
  var code = text_(data.code, 'Código', 256);
  return publicRecord_(records_('INVENTARIO').find(function(r) { return codeKey_(r.CODIGO_BARRAS) === codeKey_(code); }));
}
function equipmentValues_(data, previous) {
  var catalogs = catalogs_();
  var setor = catalogs.setores.find(function(r) { return r.ID === data.setorId && active_(r); });
  var tipo = catalogs.tipos.find(function(r) { return r.ID === data.tipoId && active_(r); });
  var modelo = catalogs.modelos.find(function(r) { return r.ID === data.modeloId && active_(r); });
  if (!setor || !tipo || !modelo || modelo.TIPO !== tipo.NOME_TIPO) fail_('VALIDATION', 'Selecione setor, tipo e modelo ativos e compatíveis.');
  var now = new Date();
  var tz = properties_().getProperty('TIME_ZONE') || 'America/Sao_Paulo';
  return [previous ? previous.ID : Utilities.getUuid(), previous ? previous.DATA : Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    previous ? previous.HORA : Utilities.formatDate(now, tz, 'HH:mm:ss'),
    text_(data.codigo, 'Código', 256), text_(data.patrimonio, 'Patrimônio', 100, true), setor.NOME_SETOR, tipo.NOME_TIPO,
    modelo.FABRICANTE, modelo.MODELO, text_(data.observacao, 'Observação', 2000, true)];
}
function saveEquipment_(data, update) {
  return withLock_(function() {
    var rows = records_('INVENTARIO');
    var code = text_(data.codigo, 'Código', 256);
    var previous = update ? rows.find(function(r) { return r.ID === data.id; }) : null;
    if (update && !previous) fail_('NOT_FOUND', 'Equipamento não encontrado.');
    var duplicate = rows.find(function(r) { return codeKey_(r.CODIGO_BARRAS) === codeKey_(code) && (!previous || r.ID !== previous.ID); });
    if (duplicate) fail_('DUPLICATE', 'EQUIPAMENTO JÁ INVENTARIADO', publicRecord_(duplicate));
    if (previous && data.version !== version_(previous)) fail_('CONFLICT', 'Este equipamento foi alterado por outro operador. Consulte novamente antes de editar.', publicRecord_(previous));
    return writeRow_('INVENTARIO', previous ? previous._row : sheet_('INVENTARIO').getLastRow() + 1, equipmentValues_(data, previous));
  });
}
function saveCatalog_(data) {
  return withLock_(function() {
    var name = data.entity;
    if (['SETORES','TIPOS','MODELOS'].indexOf(name) === -1) fail_('VALIDATION', 'Cadastro inválido.');
    var rows = records_(name);
    var old = data.id ? rows.find(function(r) { return r.ID === data.id; }) : null;
    if (data.id && !old) fail_('NOT_FOUND', 'Cadastro não encontrado.');
    var enabled = data.ativo === false ? 'NAO' : 'SIM';
    var values;
    if (name === 'MODELOS') {
      var tipo = records_('TIPOS').find(function(r) { return r.ID === data.tipoId && active_(r); });
      if (!tipo && !(old && enabled === 'NAO')) fail_('VALIDATION', 'Selecione um tipo ativo.');
      values = [old ? old.ID : Utilities.getUuid(), tipo ? tipo.NOME_TIPO : old.TIPO, text_(data.fabricante, 'Fabricante', 100), text_(data.nome, 'Modelo', 150), enabled];
    } else values = [old ? old.ID : Utilities.getUuid(), text_(data.nome, 'Nome', 100), enabled];
    var duplicate = rows.find(function(r) {
      if (old && r.ID === old.ID) return false;
      return name === 'MODELOS' ? key_(r.TIPO) === key_(values[1]) && key_(r.FABRICANTE) === key_(values[2]) && key_(r.MODELO) === key_(values[3]) : key_(r[SCHEMA_[name][1]]) === key_(values[1]);
    });
    if (duplicate) fail_('DUPLICATE_CATALOG', 'Já existe um cadastro com esse nome, inclusive entre os inativos. Edite ou reative o existente.');
    if (name === 'TIPOS' && old) {
      var models = records_('MODELOS').filter(function(r) { return r.TIPO === old.NOME_TIPO; });
      if (enabled === 'NAO' && models.some(active_)) fail_('VALIDATION', 'Desative os modelos deste tipo antes de desativá-lo.');
      // Nomes de tipo são referências na aba MODELOS; renomear mantém a relação.
      if (old.NOME_TIPO !== values[1]) models.forEach(function(r) { writeRow_('MODELOS', r._row, [r.ID, values[1], r.FABRICANTE, r.MODELO, r.ATIVO]); });
    }
    return writeRow_(name, old ? old._row : sheet_(name).getLastRow() + 1, values);
  });
}
function query_(data) {
  var term = key_(data.search || '');
  var rows = records_('INVENTARIO');
  var filtered = rows.filter(function(r) {
    return (!term || key_(r.CODIGO_BARRAS).indexOf(term) !== -1 || key_(r.PATRIMONIO).indexOf(term) !== -1) &&
      (!data.setor || r.SETOR === data.setor) && (!data.tipo || r.TIPO === data.tipo) && (!data.modelo || r.MODELO === data.modelo);
  }).reverse();
  var offset = Math.max(0, Math.floor(Number(data.offset) || 0));
  return { total: rows.length, matched: filtered.length, items: filtered.slice(offset, offset + 50).map(publicRecord_) };
}
function indicators_() {
  var rows = records_('INVENTARIO');
  var today = Utilities.formatDate(new Date(), properties_().getProperty('TIME_ZONE') || 'America/Sao_Paulo', 'yyyy-MM-dd');
  var result = { total: rows.length, today: 0, setores: Object.create(null), tipos: Object.create(null) };
  rows.forEach(function(r) {
    if (r.DATA === today) result.today++;
    result.setores[r.SETOR] = (Object.prototype.hasOwnProperty.call(result.setores, r.SETOR) ? result.setores[r.SETOR] : 0) + 1;
    result.tipos[r.TIPO] = (Object.prototype.hasOwnProperty.call(result.tipos, r.TIPO) ? result.tipos[r.TIPO] : 0) + 1;
  });
  return result;
}
function dispatch_(action, data, email) {
  switch (action) {
    case 'bootstrap': return { catalogs: catalogs_(), indicators: indicators_(), email: email };
    case 'catalogs': return catalogs_();
    case 'find': return find_(data);
    case 'query': return query_(data);
    case 'indicators': return indicators_();
    case 'saveEquipment': return saveEquipment_(data, false);
    case 'updateEquipment': return saveEquipment_(data, true);
    case 'saveCatalog': return saveCatalog_(data);
    default: fail_('ACTION', 'Operação não permitida.');
  }
}
function doGet() {
  return HtmlService.createHtmlOutput('<h1>Inventário TI</h1><p>API ativa. Acesse o site do inventário para entrar com sua conta Google.</p>');
}
function doPost(e) {
  var request, response, origin = properties_().getProperty('ALLOWED_ORIGIN');
  if (!origin || !/^https?:\/\/[^/]+$/.test(origin)) return HtmlService.createHtmlOutput('Configure ALLOWED_ORIGIN nas propriedades do script.');
  try {
    if (!e || !e.parameter || !e.parameter.payload || e.parameter.payload.length > 16000) fail_('VALIDATION', 'Solicitação inválida.');
    request = JSON.parse(e.parameter.payload);
    if (!/^[a-f0-9]{64}$/.test(request.requestId || '') || request.origin !== origin) fail_('ORIGIN', 'Origem não autorizada.');
    var email = authorize_(request.token);
    response = { ok: true, data: dispatch_(request.action, request.data || {}, email) };
  } catch (error) {
    response = { ok: false, error: { code: error.code || 'SERVER', message: error.code ? error.message : 'Falha no servidor. Verifique a configuração e as execuções do Apps Script.', record: error.record || null } };
  }
  response.channel = 'inventario-ti-v1';
  response.requestId = request && /^[a-f0-9]{64}$/.test(request.requestId || '') ? request.requestId : '';
  // Nunca inserir HTML fornecido pelo operador. A resposta não inclui o token.
  var json = JSON.stringify(response).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return HtmlService.createHtmlOutput('<!doctype html><meta charset="utf-8"><script>window.top.postMessage(' + json + ',' + JSON.stringify(origin) + ');</script>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
// Executar SOMENTE no editor, com a conta proprietária. Não exposta na API.
function setupInventory_() {
  return withLock_(function() {
    var book = spreadsheet_();
    book.setSpreadsheetTimeZone(properties_().getProperty('TIME_ZONE') || 'America/Sao_Paulo');
    Object.keys(SCHEMA_).forEach(function(name) {
      var sheet = book.getSheetByName(name) || book.insertSheet(name);
      if (!sheet.getLastRow()) sheet.getRange(1, 1, 1, SCHEMA_[name].length).setValues([SCHEMA_[name]]);
      sheet_(name); // Nunca sobrescrever uma aba com esquema diferente.
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, SCHEMA_[name].length).setBackground('#185adb').setFontColor('#ffffff').setFontWeight('bold');
      sheet.autoResizeColumns(1, SCHEMA_[name].length);
    });
    if (!records_('TIPOS').length) DEFAULT_TYPES_.forEach(function(name) { writeRow_('TIPOS', sheet_('TIPOS').getLastRow() + 1, [Utilities.getUuid(), name, 'SIM']); });
    return 'Abas preparadas. Nenhum equipamento fictício foi inserido.';
  });
}
