/* Configuração privada deve permanecer nas Propriedades do script. */
var DEPLOYMENT_DEFAULTS_ = {};
function configurarInventario_() {
  var properties = properties_();
  ['SPREADSHEET_ID','GOOGLE_CLIENT_ID','ALLOWED_ORIGIN','ALLOWED_EMAILS'].forEach(function(key) {
    if (!properties.getProperty(key)) fail_('CONFIG', 'Preencha ' + key + ' nas propriedades do script.');
  });
  return setupInventory_();
}
