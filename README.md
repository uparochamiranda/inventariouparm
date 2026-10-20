# Inventário TI

Inventário de equipamentos com leitura de códigos de barras e QR Code, desenvolvido com HTML, CSS e JavaScript, GitHub Pages, Google Sheets e Google Apps Script.

Site: https://uparochamiranda.github.io/inventariouparm/

## Funcionalidades

- Inventário por setor fixo ou por setor individual, com contador da sessão.
- Câmera traseira, digitação manual e leitor USB/Bluetooth.
- Cadastro de modelos e setores sem sair do inventário, com fabricante automático.
- Salvar e próximo, prevenção de duplicidades no servidor com LockService.
- Consulta, filtros, edição com detecção de conflitos e indicadores simples.
- Gerenciamento de tipos, modelos e setores, incluindo desativação.
- Login Google verificado no Apps Script e lista de operadores autorizados.

## Configurar

Consulte [o guia de configuração](docs/CONFIGURACAO.md). A implantação real mantém o ID da planilha e a lista de operadores somente no servidor. Este repositório contém modelos de configuração sem esses dados privados. Os valores de config.js são identificadores públicos do aplicativo.

## Executar e testar

Requer Node.js 22 ou superior. Sem instalar dependências de produção:

```sh
node scripts/serve.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
```

O site local abre em http://localhost:4173. O build gera dist/; o workflow publica no GitHub Pages. Apps Script e testes ficam fora dos arquivos públicos do site.

## Autenticação e CORS

Google Identity Services fornece um ID token mantido apenas em memória. O Apps Script verifica assinatura RS256, emissor, Client ID, expiração, e-mail verificado e autorização em ALLOWED_EMAILS. A planilha permanece privada.

Formulários POST em iframe evitam depender de CORS. A resposta por postMessage usa origem exata e um identificador aleatório por solicitação. Não usamos senha embutida, JSONP de escrita, no-cors ou chaves privadas no site.

## Validação

Os testes automatizados do servidor usam serviços Google simulados e assinaturas RSA reais de teste. O teste de navegador também simula o login e a planilha. Esses testes não comprovam gravação real. O roteiro de integração está em [VALIDACAO.md](docs/VALIDACAO.md).

## Licenças

ZXing Browser: vendor/ZXING-LICENSE. node-forge: apps-script/FORGE-LICENSE.txt. Hashes dos arquivos: vendor/SHA256SUMS.
