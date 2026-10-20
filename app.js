import { api, configured, setCredential, signedIn } from './api.js';
import { startScanner, stopScanner } from './scanner.js';

const $ = (selector, root = document) => root.querySelector(selector);
const view = $('#view');
const modal = $('#modal');
const state = {
  catalogs: { setores: [], tipos: [], modelos: [] }, indicators: null,
  session: null, draft: {}, editing: null, saving: false, querySeq: 0,
  filters: { search: '', setor: '', tipo: '', modelo: '', offset: 0 },
  catalogTab: 'MODELOS', catalogSearch: '', catalogType: ''
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const active = row => row.ATIVO === 'SIM';
const date = value => value ? value.split('-').reverse().join('/') : '—';
const route = () => location.hash.slice(1) || 'inicio';
const options = (rows, valueKey, labelKey, selected = '', placeholder = 'Selecione…') => `<option value="">${esc(placeholder)}</option>` + rows.map(row => `<option value="${esc(row[valueKey])}" ${row[valueKey] === selected ? 'selected' : ''}>${esc(typeof labelKey === 'function' ? labelKey(row) : row[labelKey])}</option>`).join('');
const names = (list, key) => [...new Set(list.map(r => r[key]))].sort((a,b) => a.localeCompare(b,'pt-BR')).map(name => ({ name }));
function toast(message, error = false) {
  const node = $('#toast'); node.textContent = message; node.classList.toggle('error', error); node.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => node.hidden = true, error ? 9000 : 4500);
}
function report(error) {
  toast(error.message || 'Ocorreu uma falha. Tente novamente.', true);
  if (error.code === 'UNAUTHORIZED') {
    $('#auth-panel').hidden = false;
    $('#connection').textContent = 'Sessão expirada';
    $('#auth-description').textContent = 'Entre novamente. Os dados do formulário foram mantidos.';
    $('#retry-login').hidden = false;
  }
}
function requireLogin() {
  if (signedIn()) return true;
  toast(configured ? 'Entre com sua conta Google para continuar.' : 'A integração precisa ser configurada. Consulte o README.', true);
  $('#auth-panel').scrollIntoView({ behavior:'smooth', block:'center' }); return false;
}
function heading(kicker, title, description, action = '') {
  return `<div class="page-heading"><div><p class="eyebrow">${kicker}</p><h1>${title}</h1><p class="subtitle">${description}</p></div>${action}</div>`;
}
function home() {
  const stats = state.indicators;
  view.innerHTML = heading('SEU PARQUE DE TI, EM DIA', 'Inventário TI', 'Cada equipamento no lugar certo. Comece uma leitura ou encontre um ativo.') +
    `<div class="hero"><div><span class="pill">INVENTÁRIO SIMPLIFICADO</span><h2>Menos planilhas abertas.<br>Mais equipamentos organizados.</h2><p>Selecione o setor, leia o código e siga para o próximo.</p><button class="primary" data-action="go-inventory">▥ &nbsp; Iniciar inventário <span>↗</span></button></div><div class="hero-art" aria-hidden="true"><div class="art-label"><span class="art-check">✓</span> EQUIPAMENTO IDENTIFICADO</div><div class="barcode">▌▎▍▌▎▌▍▎▌▎▍▌▌▎▍▌</div><div class="barcode-number">PATRIMÔNIO · TI</div><div class="art-corners"></div></div></div>` +
    `<div class="stats"><article class="stat"><span class="stat-icon">▣</span><div><p>Equipamentos inventariados</p><strong>${stats?.total ?? '—'}</strong><small>Total geral</small></div></article><article class="stat"><span class="stat-icon green">✓</span><div><p>Cadastrados hoje</p><strong>${stats?.today ?? '—'}</strong><small>Horário de Brasília</small></div></article><article class="stat"><span class="stat-icon purple">◫</span><div><p>Setores com equipamentos</p><strong>${stats ? Object.keys(stats.setores).length : '—'}</strong><small>Distribuição do inventário</small></div></article></div>` +
    `<div class="section-heading"><h2>O que vamos fazer?</h2><span>Seu próximo passo</span></div><div class="action-grid"><button class="action-card" data-action="go-inventory"><span class="card-icon blue">▥</span><h3>Iniciar Inventário</h3><p>Leia códigos e cadastre equipamentos em sequência.</p><span class="card-link">Começar agora <b>→</b></span></button><button class="action-card" data-action="go-query"><span class="card-icon teal">⌕</span><h3>Consultar Equipamentos</h3><p>Encontre, confira e atualize os dados de um ativo.</p><span class="card-link">Pesquisar equipamentos <b>→</b></span></button><button class="action-card" data-action="go-catalog"><span class="card-icon violet">▤</span><h3>Cadastros</h3><p>Organize seus setores, tipos e modelos de equipamentos.</p><span class="card-link">Gerenciar cadastros <b>→</b></span></button></div>` +
    `<div class="summary-grid">${summary('Por setor', stats?.setores)}${summary('Por tipo de equipamento', stats?.tipos)}</div><div class="tip"><span>ⓘ</span><p><strong>Pronto para uma leitura rápida?</strong> Leitores USB e Bluetooth também funcionam: toque no campo de código e faça a leitura.</p></div>`;
}
function summary(title, data) {
  const entries = Object.entries(data || {}).sort((a,b) => b[1]-a[1]);
  return `<article class="panel"><h2>${title}</h2>${entries.length ? `<ul class="summary-list">${entries.map(([name,count]) => `<li><span>${esc(name)}</span><b>${count}</b></li>`).join('')}</ul>` : `<p class="empty">${state.indicators ? 'Nenhum equipamento cadastrado.' : 'Conecte-se para ver o resumo.'}</p>`}</article>`;
}
function modeSelection() {
  view.innerHTML = heading('NOVA SESSÃO', 'Como você quer inventariar?', 'Escolha o fluxo que combina com a sua rotina.') +
    `<div class="mode-grid"><article class="panel mode-card"><span class="card-icon blue">◫</span><h2>Inventário por setor</h2><p>Escolha o setor uma vez. Todos os equipamentos lidos serão vinculados a ele.</p><span class="tag">Ideal para uma sala por vez</span><label for="start-sector">Setor de trabalho</label><select id="start-sector">${options(state.catalogs.setores.filter(active),'ID','NOME_SETOR')}</select><button class="text-button" data-action="new-sector">+ Cadastrar setor</button><button class="primary full" data-action="start-sector">Começar neste setor →</button></article><article class="panel mode-card"><span class="card-icon teal">⇄</span><h2>Setor individual</h2><p>Selecione um setor para cada equipamento. Alterne entre locais durante a leitura.</p><span class="tag">Ideal para equipamentos de vários locais</span><div class="mode-spacer"></div><button class="secondary full" data-action="start-individual">Começar com setor individual →</button></article></div>`;
}
function equipment() {
  if (!state.session && !state.editing) return modeSelection();
  const s = state.session;
  const d = state.draft;
  const sector = state.catalogs.setores.find(r => r.ID === s?.setorId);
  const fixed = !state.editing && s?.mode === 'sector';
  if (fixed) d.setorId = s.setorId;
  view.innerHTML = heading(state.editing ? 'EQUIPAMENTO EXISTENTE' : 'LEITURA EM SEQUÊNCIA', state.editing ? 'Atualizar equipamento' : 'Novo equipamento', state.editing ? 'Confira as informações antes de confirmar a alteração.' : 'Leia o código, selecione o modelo e continue.', `<span class="session-count">${s?.count ?? 0} cadastrados nesta sessão</span>`) +
    (s ? `<div class="session-bar"><div><span class="dot"></span><strong>${fixed ? 'Setor atual: ' + esc(sector?.NOME_SETOR || 'Selecione um setor ativo') : 'Setor individual'}</strong><small>${fixed ? 'Mantido em todas as leituras' : 'Escolha o setor de cada equipamento'}</small></div><div>${s.mode === 'sector' && !state.editing ? '<button class="text-button" data-action="switch-sector">Trocar setor</button>' : ''}<button class="text-button" data-action="finish">Finalizar inventário</button></div></div>` : '') +
    `<form id="equipment-form" class="panel equipment-panel"><div class="form-section-title"><span>01</span><h2>Identificação do equipamento</h2></div><label for="codigo">Código de barras <span class="required">*</span></label><div class="code-row"><input id="codigo" name="codigo" value="${esc(d.codigo)}" required maxlength="256" placeholder="Leia ou digite o código" autocomplete="off" spellcheck="false"><button type="button" class="primary" data-action="scan">▥ &nbsp; Iniciar leitura</button></div><p class="field-help">Câmera, digitação manual ou leitor USB / Bluetooth.</p><div class="form-grid"><div><label for="setorId">Setor <span class="required">*</span></label><select id="setorId" name="setorId" required ${fixed ? 'disabled' : ''}>${options(state.catalogs.setores.filter(active),'ID','NOME_SETOR',d.setorId)}</select>${!fixed ? '<button type="button" class="text-button" data-action="new-sector">+ Cadastrar setor</button>' : ''}</div><div><label for="patrimonio">Patrimônio <small>opcional</small></label><input id="patrimonio" name="patrimonio" value="${esc(d.patrimonio)}" maxlength="100" placeholder="Número do patrimônio"></div></div><div class="form-section-title second"><span>02</span><h2>Tipo e modelo</h2></div><div class="form-grid"><div><label for="tipoId">Tipo de equipamento <span class="required">*</span></label><select id="tipoId" name="tipoId" required>${options(state.catalogs.tipos.filter(active),'ID','NOME_TIPO',d.tipoId)}</select></div><div><label for="model-search">Pesquisar modelos</label><input id="model-search" type="search" placeholder="Fabricante ou nome do modelo" autocomplete="off"></div><div><label for="modeloId">Modelo <span class="required">*</span></label><select id="modeloId" name="modeloId" required></select><button type="button" class="text-button" data-action="new-model">+ Cadastrar novo modelo</button></div><div><label for="fabricante">Fabricante</label><input id="fabricante" readonly placeholder="Preenchido pelo modelo"></div></div><label for="observacao">Observação <small>opcional</small></label><textarea id="observacao" name="observacao" rows="3" maxlength="2000" placeholder="Estado do equipamento ou outra informação útil">${esc(d.observacao)}</textarea><div class="form-footer"><span>* Campos obrigatórios</span><div><button type="button" class="secondary" data-action="cancel-equipment">${state.editing ? 'Cancelar edição' : 'Limpar campos'}</button><button type="submit" class="secondary" name="intent" value="stay">${state.editing ? 'Salvar alterações' : 'Salvar equipamento'}</button><button type="submit" class="primary" name="intent" value="next">${state.editing ? 'Salvar e próximo' : 'SALVAR E PRÓXIMO'} &nbsp; →</button></div></div></form>`;
  $('.code-row').insertAdjacentHTML('afterend','<button type="button" class="text-button manual-entry-button" data-action="manual-entry">Digitar código manualmente</button>');
  updateModels();
}
function enterCodeManually() {
  closeCamera();
  const input = $('#codigo');
  if (!input) return;
  input.focus(); input.select();
  input.scrollIntoView({ behavior:'smooth', block:'center' });
}
function readDraft() {
  const form = $('#equipment-form');
  if (!form) return;
  for (const name of ['codigo','setorId','tipoId','modeloId','patrimonio','observacao']) state.draft[name] = form.elements[name].value;
}
function updateModels() {
  const select = $('#modeloId'); if (!select) return;
  const type = state.catalogs.tipos.find(r => r.ID === $('#tipoId').value);
  const search = $('#model-search').value.trim().toLocaleLowerCase('pt-BR');
  const selected = state.draft.modeloId || '';
  const models = state.catalogs.modelos.filter(r => active(r) && r.TIPO === type?.NOME_TIPO && (!search || `${r.FABRICANTE} ${r.MODELO}`.toLocaleLowerCase('pt-BR').includes(search) || r.ID === selected));
  select.innerHTML = options(models,'ID',r => `${r.FABRICANTE} · ${r.MODELO}`,selected, type ? 'Selecione o modelo…' : 'Escolha primeiro o tipo') + '<option value="__new">+ Cadastrar novo modelo</option>';
  $('#fabricante').value = models.find(r => r.ID === select.value)?.FABRICANTE || '';
}
function openDialog(html) {
  $('#modal-content').innerHTML = html;
  if (!modal.open) modal.showModal();
}
function dialogHeading(title) { return `<div class="dialog-heading"><h2 id="modal-title">${title}</h2><button type="button" class="icon-button" data-action="close-modal" aria-label="Fechar">×</button></div>`; }
function catalogDialog(entity, record = null) {
  if (!requireLogin()) return;
  readDraft();
  const model = entity === 'MODELOS';
  const typeId = record ? state.catalogs.tipos.find(r => r.NOME_TIPO === record.TIPO)?.ID : state.draft.tipoId;
  const title = `${record ? 'Editar' : 'Cadastrar'} ${model ? 'modelo' : entity === 'TIPOS' ? 'tipo' : 'setor'}`;
  openDialog(dialogHeading(title) + `<form id="catalog-form" data-entity="${entity}" data-id="${esc(record?.ID || '')}">${model ? `<label for="catalog-type">Tipo de equipamento *</label><select id="catalog-type" name="tipoId" required>${options(state.catalogs.tipos.filter(r => active(r) || r.ID === typeId),'ID','NOME_TIPO', typeId)}</select><label for="catalog-manufacturer">Fabricante *</label><input id="catalog-manufacturer" name="fabricante" required maxlength="100" value="${esc(record?.FABRICANTE)}" placeholder="Ex.: Dell">` : ''}<label for="catalog-name">${model ? 'Nome do modelo' : 'Nome'} *</label><input id="catalog-name" name="nome" required maxlength="${model ? 150 : 100}" value="${esc(model ? record?.MODELO : record?.[entity === 'SETORES' ? 'NOME_SETOR' : 'NOME_TIPO'])}" placeholder="${model ? 'Ex.: OptiPlex 3080' : entity === 'SETORES' ? 'Ex.: Sala Amarela' : 'Ex.: Monitor'}">${record ? `<label class="checkbox"><input type="checkbox" name="ativo" ${active(record) ? 'checked' : ''}> Cadastro ativo</label>` : ''}<p class="field-help">O cadastro será salvo no Google Sheets.</p><div class="dialog-actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button class="primary" type="submit">Salvar ${model ? 'modelo' : 'cadastro'}</button></div></form>`);
}
async function submitCatalog(form) {
  if (state.saving || !requireLogin()) return;
  state.saving = true;
  const button = $('button[type=submit]',form); button.disabled = true; button.textContent = 'Salvando…';
  try {
    const data = Object.fromEntries(new FormData(form));
    data.entity = form.dataset.entity; data.id = form.dataset.id; data.ativo = !data.id || form.elements.ativo.checked;
    const saved = await api('saveCatalog',data);
    state.catalogs = await api('catalogs');
    modal.close();
    if ($('#equipment-form')) {
      if (data.entity === 'MODELOS' && !data.id) { state.draft.tipoId = data.tipoId; state.draft.modeloId = saved.ID; }
      if (data.entity === 'SETORES' && !data.id && state.session?.mode !== 'sector') state.draft.setorId = saved.ID;
      equipment();
    } else {
      render();
      if (data.entity === 'SETORES' && !data.id && $('#start-sector')) $('#start-sector').value = saved.ID;
    }
    toast('Cadastro confirmado na planilha.');
  } catch (error) { report(error); }
  finally { state.saving = false; if (button.isConnected) { button.disabled = false; button.textContent = 'Salvar'; } }
}
function detailMarkup(record) {
  return `<dl class="details">${[['Código',record.CODIGO_BARRAS],['Patrimônio',record.PATRIMONIO || '—'],['Setor',record.SETOR],['Tipo',record.TIPO],['Fabricante',record.FABRICANTE],['Modelo',record.MODELO],['Data do cadastro',`${date(record.DATA)} às ${record.HORA}`],['Observação',record.OBSERVACAO || '—']].map(([label,value]) => `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
}
function duplicateDialog(record) {
  state.duplicate = record;
  openDialog(dialogHeading('EQUIPAMENTO JÁ INVENTARIADO') + '<p class="notice">Este código já existe na planilha. Nenhum novo registro foi gravado.</p>' + detailMarkup(record) + '<div class="dialog-actions"><button class="secondary" data-action="close-modal">Cancelar</button><button class="secondary" data-action="duplicate-view">Consultar equipamento</button><button class="primary" data-action="duplicate-edit">Atualizar informações</button></div>');
}
function editEquipment(record) {
  state.editing = record;
  state.draft = {
    codigo: record.CODIGO_BARRAS, patrimonio: record.PATRIMONIO, observacao: record.OBSERVACAO,
    setorId: state.catalogs.setores.find(r => r.NOME_SETOR === record.SETOR && active(r))?.ID || '',
    tipoId: state.catalogs.tipos.find(r => r.NOME_TIPO === record.TIPO && active(r))?.ID || '',
    modeloId: state.catalogs.modelos.find(r => r.TIPO === record.TIPO && r.FABRICANTE === record.FABRICANTE && r.MODELO === record.MODELO && active(r))?.ID || ''
  };
  modal.close();
  if (route() !== 'inventario') location.hash = 'inventario'; else equipment();
  if (!state.draft.setorId || !state.draft.tipoId || !state.draft.modeloId) toast('Alguns cadastros foram alterados ou desativados. Escolha as opções ativas antes de salvar.', true);
}
async function saveEquipment(next) {
  if (state.saving || !requireLogin()) return;
  readDraft();
  const form = $('#equipment-form');
  if (!form.reportValidity()) return;
  if (state.draft.modeloId === '__new') return catalogDialog('MODELOS');
  state.saving = true;
  const controls = [...form.querySelectorAll('button,input,select,textarea')];
  const prior = controls.map(control => control.disabled); controls.forEach(control => control.disabled = true);
  try {
    if (!state.editing) {
      const found = await api('find', { code: state.draft.codigo.trim() });
      if (found) { duplicateDialog(found); return; }
    }
    const editing = state.editing;
    const result = await api(editing ? 'updateEquipment' : 'saveEquipment', {
      ...state.draft, id: editing?.ID, version: editing?._version
    });
    if (!editing && state.session) state.session.count++;
    state.editing = next ? null : result;
    toast(editing ? 'Alterações confirmadas no Google Sheets.' : 'Equipamento salvo no Google Sheets.');
    if (next) {
      state.draft = { tipoId: state.draft.tipoId, modeloId: state.draft.modeloId, setorId: state.session?.mode === 'sector' ? state.session.setorId : '' };
      if (!state.session) { state.session = { mode:'individual',count:0 }; }
    }
    if (route() === 'inventario') { equipment(); if (next) $('#codigo').focus(); }
    else render();
    // Indicadores são secundários: falha aqui não desfaz nem esconde a confirmação.
    api('indicators').then(data => { state.indicators = data; }).catch(() => {});
  } catch (error) {
    if (error.code === 'DUPLICATE') duplicateDialog(error.record);
    else if (error.code === 'CONFLICT') {
      state.duplicate = error.record;
      openDialog(dialogHeading('Registro alterado por outro operador') + `<p>${esc(error.message)}</p>` + detailMarkup(error.record) + '<div class="dialog-actions"><button class="secondary" data-action="close-modal">Cancelar</button><button class="primary" data-action="duplicate-edit">Carregar versão atual</button></div>');
    } else report(error);
  } finally {
    state.saving = false;
    controls.forEach((control,i) => control.disabled = prior[i]);
  }
}
let cameraSession = 0;
let torchOn = false;
function resetTorch() {
  cameraSession++;
  torchOn = false;
  $('#toggle-torch').disabled = true;
  $('#toggle-torch').textContent = 'Ligar lanterna';
  $('#toggle-torch').setAttribute('aria-pressed', 'false');
  $('#torch-status').textContent = 'Verificando suporte à lanterna…';
}
function prepareTorch() {
  const track = $('#camera').srcObject?.getVideoTracks()[0];
  const supported = track?.readyState === 'live' && track.getCapabilities?.().torch === true;
  $('#toggle-torch').disabled = !supported;
  $('#torch-status').textContent = supported ? 'Use a lanterna para iluminar a etiqueta.' : 'Lanterna indisponível nesta câmera ou navegador.';
}
async function toggleTorch() {
  const track = $('#camera').srcObject?.getVideoTracks()[0];
  if (!track || $('#toggle-torch').disabled) return;
  const session = cameraSession;
  const next = !torchOn;
  $('#toggle-torch').disabled = true;
  try {
    await track.applyConstraints({ ...track.getConstraints(), advanced: [{ torch: next }] });
    if (session !== cameraSession) return;
    torchOn = track.getSettings().torch ?? next;
    $('#toggle-torch').textContent = torchOn ? 'Desligar lanterna' : 'Ligar lanterna';
    $('#toggle-torch').setAttribute('aria-pressed', String(torchOn));
    $('#torch-status').textContent = torchOn ? 'Lanterna ligada.' : 'Lanterna desligada.';
  } catch {
    if (session !== cameraSession) return;
    $('#torch-status').textContent = 'Não foi possível alterar a lanterna. Tente novamente.';
  } finally {
    if (session === cameraSession) $('#toggle-torch').disabled = false;
  }
}
async function scan() {
  if (state.saving || !requireLogin()) return;
  const dialog = $('#camera-dialog'); dialog.showModal();
  resetTorch();
  const session = cameraSession;
  $('#camera-status').textContent = 'Abrindo câmera traseira…';
  try {
    await startScanner($('#camera'), code => {
      closeCamera();
      $('#codigo').value = code; readDraft();
      toast('Código identificado. Confira os dados do equipamento.');
      checkCode();
    });
    if (dialog.open && session === cameraSession) {
      prepareTorch();
      $('#camera-status').textContent = 'Posicione o código dentro da área de leitura.';
    }
  } catch (error) {
    if (session !== cameraSession) return;
    stopScanner($('#camera'));
    resetTorch();
    $('#torch-status').textContent = 'Lanterna indisponível sem a câmera aberta.';
    $('#camera-status').textContent = error.name === 'NotAllowedError' ? 'Permissão de câmera negada. Autorize no navegador ou digite o código.' : error.message;
  }
}
function closeCamera() { resetTorch(); stopScanner($('#camera')); $('#camera-dialog').close(); }
async function checkCode() {
  const input = $('#codigo');
  if (!signedIn() || !input?.value.trim() || state.editing || state.saving) return;
  const code = input.value.trim();
  try {
    const record = await api('find',{ code });
    if (record && $('#codigo')?.value.trim() === code) duplicateDialog(record);
  } catch (error) { report(error); }
}
function queryView() {
  const f = state.filters;
  view.innerHTML = heading('ENCONTRE SEUS ATIVOS', 'Consultar equipamentos', 'Pesquise por código ou patrimônio e refine pelos filtros.', `<button class="primary" data-action="go-inventory">+ Novo equipamento</button>`) +
    `<section class="panel"><div class="query-search"><label for="query-search">Código ou patrimônio</label><input id="query-search" type="search" placeholder="⌕  Digite para pesquisar…" value="${esc(f.search)}" autocomplete="off"></div><div class="filter-grid"><div><label for="filter-sector">Setor</label><select id="filter-sector">${options(names(state.catalogs.setores,'NOME_SETOR'),'name','name',f.setor,'Todos os setores')}</select></div><div><label for="filter-type">Tipo</label><select id="filter-type">${options(names(state.catalogs.tipos,'NOME_TIPO'),'name','name',f.tipo,'Todos os tipos')}</select></div><div><label for="filter-model">Modelo</label><input id="filter-model" list="query-models" value="${esc(f.modelo)}" placeholder="Todos os modelos"><datalist id="query-models">${names(state.catalogs.modelos,'MODELO').map(r => `<option value="${esc(r.name)}">`).join('')}</datalist></div><button class="secondary" data-action="clear-filters">Limpar filtros</button></div></section><div id="query-results" aria-live="polite"></div>`;
  if (signedIn()) loadQuery(); else $('#query-results').innerHTML = '<p class="empty panel">Entre com sua conta para consultar os equipamentos.</p>';
}
async function loadQuery() {
  const target = $('#query-results'); if (!target || !signedIn()) return;
  const seq = ++state.querySeq; target.innerHTML = '<p class="empty panel">Consultando a planilha…</p>';
  try {
    const result = await api('query',state.filters);
    if (seq !== state.querySeq || !target.isConnected) return;
    state.queryItems = result.items;
    target.innerHTML = `<div class="section-heading"><h2>${result.matched} equipamento${result.matched === 1 ? '' : 's'} encontrado${result.matched === 1 ? '' : 's'}</h2><span>${result.total} no total</span></div>` +
      (result.items.length ? `<div class="panel table-wrap"><table><thead><tr><th>Código / Patrimônio</th><th>Equipamento</th><th>Setor</th><th>Cadastro</th><th>Ações</th></tr></thead><tbody>${result.items.map(r => `<tr><td><strong>${esc(r.CODIGO_BARRAS)}</strong><small>${esc(r.PATRIMONIO || 'Sem patrimônio')}</small></td><td>${esc(r.TIPO)}<small>${esc(r.FABRICANTE)} ${esc(r.MODELO)}</small></td><td><span class="tag">${esc(r.SETOR)}</span></td><td>${date(r.DATA)}<small>${esc(r.HORA)}</small></td><td><button class="text-button" data-action="record-view" data-id="${esc(r.ID)}">Ver</button><button class="text-button" data-action="record-edit" data-id="${esc(r.ID)}">Editar</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="panel empty"><span class="empty-icon">⌕</span><h3>Nenhum equipamento encontrado</h3><p>Tente outro código ou ajuste os filtros.</p></div>') +
      `<div class="pagination"><button class="secondary" data-action="prev-page" ${state.filters.offset === 0 ? 'disabled' : ''}>← Anterior</button><span>Página ${Math.floor(state.filters.offset/50)+1}</span><button class="secondary" data-action="next-page" ${state.filters.offset + 50 >= result.matched ? 'disabled' : ''}>Próxima →</button></div>`;
  } catch (error) { if (target.isConnected && seq === state.querySeq) target.innerHTML = `<p class="notice error">${esc(error.message)}</p>`; report(error); }
}
function catalogView() {
  const tab = state.catalogTab;
  view.innerHTML = heading('BASE ORGANIZADA', 'Cadastros', 'Mantenha os setores, tipos e modelos prontos para a próxima leitura.', `<button class="primary" data-action="new-catalog">+ Cadastrar ${tab === 'MODELOS' ? 'modelo' : tab === 'TIPOS' ? 'tipo' : 'setor'}</button>`) +
    `<div class="tabs" role="tablist" aria-label="Cadastros">${[['MODELOS','Modelos'],['TIPOS','Tipos de equipamentos'],['SETORES','Setores']].map(([key,label]) => `<button role="tab" aria-selected="${key === tab}" data-action="catalog-tab" data-tab="${key}">${label}</button>`).join('')}</div><section class="panel"><div class="filter-grid"><div><label for="catalog-search">Pesquisar ${tab.toLowerCase()}</label><input id="catalog-search" type="search" placeholder="Nome ou fabricante…" value="${esc(state.catalogSearch)}"></div>${tab === 'MODELOS' ? `<div><label for="catalog-filter-type">Tipo de equipamento</label><select id="catalog-filter-type">${options(state.catalogs.tipos,'ID','NOME_TIPO',state.catalogType,'Todos os tipos')}</select></div>` : ''}<p class="field-help">Cadastros inativos continuam no histórico.</p></div><div id="catalog-list"></div></section>`;
  catalogList();
}
function catalogList() {
  const tab = state.catalogTab;
  const key = { MODELOS:'modelos',TIPOS:'tipos',SETORES:'setores' }[tab];
  const typeName = state.catalogs.tipos.find(r => r.ID === state.catalogType)?.NOME_TIPO;
  const search = state.catalogSearch.toLocaleLowerCase('pt-BR');
  const rows = state.catalogs[key].filter(r => (!search || Object.values(r).join(' ').toLocaleLowerCase('pt-BR').includes(search)) && (tab !== 'MODELOS' || !typeName || r.TIPO === typeName));
  $('#catalog-list').innerHTML = rows.length ? `<div class="table-wrap"><table><thead><tr><th>${tab === 'MODELOS' ? 'Modelo' : 'Nome'}</th>${tab === 'MODELOS' ? '<th>Tipo</th><th>Fabricante</th>' : ''}<th>Status</th><th>Ações</th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${esc(r.MODELO || r.NOME_TIPO || r.NOME_SETOR)}</strong></td>${tab === 'MODELOS' ? `<td>${esc(r.TIPO)}</td><td>${esc(r.FABRICANTE)}</td>` : ''}<td><span class="status ${active(r) ? 'active' : ''}">${active(r) ? 'Ativo' : 'Inativo'}</span></td><td><button class="text-button" data-action="edit-catalog" data-id="${esc(r.ID)}">Editar</button><button class="text-button" data-action="toggle-catalog" data-id="${esc(r.ID)}">${active(r) ? 'Desativar' : 'Reativar'}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty"><h3>${signedIn() ? 'Nenhum cadastro encontrado' : 'Conecte-se para acessar os cadastros'}</h3><p>${signedIn() ? 'Adicione um cadastro ou ajuste a pesquisa.' : 'Os dados serão carregados do Google Sheets.'}</p></div>`;
}
function render() {
  document.querySelectorAll('[data-nav]').forEach(link => link.classList.toggle('selected',link.dataset.nav === route()));
  switch (route()) { case 'inventario': equipment(); break; case 'consulta': queryView(); break; case 'cadastros': catalogView(); break; default: home(); }
}
function confirmDialog(title, message, action) {
  openDialog(dialogHeading(title) + `<p>${esc(message)}</p><div class="dialog-actions"><button class="secondary" data-action="close-modal">Cancelar</button><button class="primary" data-action="${action}">Confirmar</button></div>`);
}
const actions = {
  'go-inventory': () => location.hash = 'inventario', 'go-query': () => location.hash = 'consulta', 'go-catalog': () => location.hash = 'cadastros',
  'new-sector': () => catalogDialog('SETORES'), 'new-model': () => catalogDialog('MODELOS'),
  'new-catalog': () => catalogDialog(state.catalogTab), 'close-modal': () => { if (!state.saving) modal.close(); },
  'start-sector': () => { if (!requireLogin()) return; const id = $('#start-sector').value; if (!id) return toast('Selecione um setor para começar.',true); state.session = { mode:'sector',setorId:id,count:0 }; state.editing = null; state.draft = {}; equipment(); $('#codigo').focus(); },
  'start-individual': () => { if (!requireLogin()) return; state.session = { mode:'individual',count:0 }; state.editing = null; state.draft = {}; equipment(); $('#codigo').focus(); },
  'switch-sector': () => { readDraft(); openDialog(dialogHeading('Trocar setor') + `<form id="switch-sector-form"><label for="switch-sector">Próximo setor</label><select id="switch-sector" name="setor" required>${options(state.catalogs.setores.filter(active),'ID','NOME_SETOR',state.session.setorId)}</select><p>O setor será aplicado ao equipamento atual e às próximas leituras.</p><div class="dialog-actions"><button type="button" class="secondary" data-action="close-modal">Cancelar</button><button type="submit" class="primary">Trocar setor</button></div></form>`); },
  'finish': () => confirmDialog('Finalizar inventário?',`${state.session?.count || 0} equipamentos cadastrados nesta sessão. Dados ainda não salvos no formulário serão descartados.`, 'confirm-finish'),
  'confirm-finish': () => { modal.close(); state.session = null; state.editing = null; state.draft = {}; location.hash = 'inicio'; api('indicators').then(data => { state.indicators = data; if (route() === 'inicio') home(); }).catch(report); },
  'cancel-equipment': () => confirmDialog(state.editing ? 'Cancelar edição?' : 'Limpar formulário?', 'Os campos ainda não salvos serão descartados.', 'confirm-clear'),
  'confirm-clear': () => { modal.close(); const hadEdit = !!state.editing; state.editing = null; state.draft = {}; if (hadEdit && !state.session) location.hash = 'consulta'; else equipment(); },
  'scan': scan,
  'manual-entry': enterCodeManually,
  'duplicate-view': () => openDialog(dialogHeading('Consultar equipamento') + detailMarkup(state.duplicate) + '<div class="dialog-actions"><button class="secondary" data-action="close-modal">Fechar</button><button class="primary" data-action="duplicate-edit">Atualizar informações</button></div>'),
  'duplicate-edit': () => editEquipment(state.duplicate),
  'record-view': button => { state.duplicate = state.queryItems.find(r => r.ID === button.dataset.id); actions['duplicate-view'](); },
  'record-edit': button => editEquipment(state.queryItems.find(r => r.ID === button.dataset.id)),
  'clear-filters': () => { state.filters = { search:'',setor:'',tipo:'',modelo:'',offset:0 }; queryView(); },
  'prev-page': () => { state.filters.offset = Math.max(0,state.filters.offset-50); loadQuery(); },
  'next-page': () => { state.filters.offset += 50; loadQuery(); },
  'catalog-tab': button => { state.catalogTab = button.dataset.tab; state.catalogSearch = ''; state.catalogType = ''; catalogView(); },
  'edit-catalog': button => catalogDialog(state.catalogTab, catalogRecord(button.dataset.id)),
  'toggle-catalog': button => { if (!requireLogin()) return; const r = catalogRecord(button.dataset.id); state.toggleRecord = r; confirmDialog(active(r) ? 'Desativar cadastro?' : 'Reativar cadastro?',active(r) ? 'O cadastro deixará de aparecer nas novas leituras. Registros existentes serão preservados.' : 'O cadastro voltará a aparecer nas novas leituras.', 'confirm-toggle'); },
  'confirm-toggle': async () => {
    if (state.saving) return; state.saving = true;
    try { const r = state.toggleRecord; await api('saveCatalog',{ entity:state.catalogTab,id:r.ID,nome:r.MODELO || r.NOME_TIPO || r.NOME_SETOR, fabricante:r.FABRICANTE, tipoId:state.catalogs.tipos.find(t => t.NOME_TIPO === r.TIPO)?.ID,ativo:!active(r) }); state.catalogs = await api('catalogs'); modal.close(); catalogView(); toast('Cadastro atualizado na planilha.'); }
    catch (error) { report(error); } finally { state.saving = false; }
  }
};
function catalogRecord(id) { return state.catalogs[{MODELOS:'modelos',TIPOS:'tipos',SETORES:'setores'}[state.catalogTab]].find(r => r.ID === id); }
document.addEventListener('click', event => {
  if (state.saving && event.target.closest('a[href^="#"]')) { event.preventDefault(); toast('Aguarde a confirmação da gravação.'); return; }
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  if (state.saving) return;
  const result = actions[button.dataset.action]?.(button); if (result?.catch) result.catch(report);
});
document.addEventListener('submit', event => {
  const form = event.target;
  if (!['equipment-form','catalog-form','switch-sector-form'].includes(form.id)) return;
  event.preventDefault();
  if (form.id === 'equipment-form') saveEquipment(event.submitter?.value === 'next');
  if (form.id === 'catalog-form') submitCatalog(form);
  if (form.id === 'switch-sector-form') { state.session.setorId = form.elements.setor.value; state.draft.setorId = state.session.setorId; modal.close(); equipment(); }
});
document.addEventListener('keydown', event => {
  if (event.target.id === 'codigo' && event.key === 'Enter') { event.preventDefault(); readDraft(); checkCode(); $('#tipoId')?.focus(); }
});
let queryTimer;
document.addEventListener('input', event => {
  const target = event.target;
  if (target.closest('#equipment-form')) readDraft();
  if (target.id === 'model-search') updateModels();
  if (target.id === 'catalog-search') { state.catalogSearch = target.value; catalogList(); }
  if (target.id === 'query-search' || target.id === 'filter-model') {
    state.filters[target.id === 'query-search' ? 'search' : 'modelo'] = target.value;
    state.filters.offset = 0; clearTimeout(queryTimer); queryTimer = setTimeout(loadQuery,350);
  }
});
document.addEventListener('change', event => {
  const target = event.target;
  if (target.id === 'tipoId') { state.draft.tipoId = target.value; state.draft.modeloId = ''; $('#model-search').value = ''; updateModels(); }
  if (target.id === 'modeloId') { if (target.value === '__new') { target.value = ''; state.draft.modeloId = ''; catalogDialog('MODELOS'); } else { state.draft.modeloId = target.value; updateModels(); } }
  if (target.id === 'codigo') checkCode();
  if (target.id === 'filter-sector' || target.id === 'filter-type') { state.filters[target.id === 'filter-sector' ? 'setor' : 'tipo'] = target.value; state.filters.offset = 0; loadQuery(); }
  if (target.id === 'catalog-filter-type') { state.catalogType = target.value; catalogList(); }
});
modal.addEventListener('cancel', event => { if (state.saving) event.preventDefault(); });
$('#close-camera').onclick = closeCamera;
$('#manual-camera').onclick = enterCodeManually;
$('#toggle-torch').onclick = toggleTorch;
$('#camera-dialog').addEventListener('cancel', closeCamera);
window.addEventListener('hashchange', () => { readDraft(); closeCamera(); render(); });
window.addEventListener('pagehide', closeCamera);
window.addEventListener('beforeunload', event => {
  if (state.saving || state.draft.codigo || state.draft.patrimonio || state.draft.observacao) { event.preventDefault(); event.returnValue = ''; }
});
$('#logout').onclick = () => {
  if (state.saving) return;
  setCredential(''); window.google?.accounts?.id.disableAutoSelect();
  state.catalogs = { setores:[],tipos:[],modelos:[] }; state.indicators = null; state.session = null; state.draft = {}; state.editing = null; state.queryItems = []; state.duplicate = null;
  $('#connection').textContent = 'Não conectado'; $('#auth-panel').hidden = false; $('#logout').hidden = true; render();
};
async function onCredential(response) {
  setCredential(response.credential); $('#connection').textContent = 'Conectando…';
  try {
    const result = await api('bootstrap');
    state.catalogs = result.catalogs; state.indicators = result.indicators;
    $('#connection').textContent = result.email; $('#connection').classList.add('online');
    $('#auth-panel').hidden = true; $('#logout').hidden = false;
    render(); toast('Conexão com o Google Sheets confirmada.');
  } catch (error) { setCredential(''); $('#connection').textContent = 'Não conectado'; report(error); }
}
async function initializeLogin() {
  if (!configured) {
    $('#auth-title').textContent = 'Integração aguardando configuração';
    $('#auth-description').textContent = 'Configure o Apps Script e o login Google seguindo o README. Nenhuma gravação está habilitada.';
    return;
  }
  for (let attempt=0; attempt<40; attempt++) {
    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({ client_id:window.INVENTARIO_CONFIG.googleClientId,callback:onCredential,auto_select:false });
      window.google.accounts.id.renderButton($('#google-signin'),{ theme:'outline',size:'large',text:'signin_with',locale:'pt-BR' });
      return;
    }
    await new Promise(resolve => setTimeout(resolve,250));
  }
  $('#auth-description').textContent = 'O login Google não carregou. Verifique sua conexão e os bloqueadores do navegador.';
  $('#retry-login').hidden = false;
}
$('#retry-login').onclick = initializeLogin;
render(); initializeLogin();
