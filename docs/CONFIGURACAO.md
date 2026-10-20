# Configuração

## Google Sheets e Apps Script

1. Crie uma planilha privada ou use a planilha de destino do projeto.
2. Abra Extensões → Apps Script. Copie os arquivos .gs de apps-script/ e o manifesto appsscript.json.
3. Em Configurações do projeto → Propriedades do script, configure:

| Propriedade | Valor |
| --- | --- |
| SPREADSHEET_ID | ID privado da sua planilha |
| GOOGLE_CLIENT_ID | Mesmo Client ID público de config.js |
| ALLOWED_ORIGIN | https://uparochamiranda.github.io |
| ALLOWED_EMAILS | E-mails completos dos operadores, separados por vírgulas |
| TIME_ZONE | America/Sao_Paulo |

Não publique o ID privado da planilha nem a lista de operadores neste repositório.

4. Execute configurarInventario_ no editor para validar as propriedades e preparar as abas. A rotina não apaga equipamentos existentes.
5. Publique como aplicativo da Web: executar como proprietário, acesso de transporte para qualquer pessoa. O código exige token Google válido e e-mail autorizado em toda operação de dados.
6. Copie a URL terminada em /exec para config.js. Para atualizar uma implantação existente, crie uma nova versão mantendo seu ID de implantação.

## Login Google

No Google Cloud Console, configure Google Auth Platform e um cliente OAuth do tipo Aplicativo da Web. Cadastre a origem JavaScript https://uparochamiranda.github.io sem caminho. Para desenvolvimento local, adicione http://localhost:4173 e use uma implantação de teste com essa ALLOWED_ORIGIN. Copie apenas o Client ID público para config.js. Não publique Client Secret ou tokens.

## GitHub Pages

O repositório público deve se chamar inventariouparm na conta uparochamiranda. Em Settings → Pages, use GitHub Actions como fonte. O workflow testa o servidor, constrói dist/ e publica. Os caminhos dos recursos são relativos ao subdiretório e a navegação usa fragmentos.

## Teste real

Entre com operador autorizado, cadastre um setor e confira um modelo. Salve um equipamento identificável e confirme sua linha diretamente no Sheets. Repita o código e verifique que a quantidade não aumenta. Teste atualização, os dois modos e câmera física. Não considere a integração validada apenas por HTTP 200 ou testes simulados.
