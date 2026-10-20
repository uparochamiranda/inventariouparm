# Validação

## O que foi testado localmente

`node --test tests/*.test.mjs` executa os testes de servidor e transporte sem acessar uma planilha real. Eles usam serviços Google simulados, com pares RSA e assinaturas reais gerados pelo Node apenas durante o teste.

- Aceita token RS256 correto e recusa assinatura adulterada, algoritmo diferente, emissor/destinatário incorretos, expiração e e-mail não verificado.
- Recusa conta fora da lista de operadores, origem incorreta, operação desconhecida e chamada sem login; nenhuma dessas tentativas escreve na planilha simulada.
- Preserva zeros iniciais, deriva fabricante no servidor e recusa duplicidades dentro de um bloqueio de escrita.
- Valida campos obrigatórios, setor/tipo/modelo ativos e associação do modelo com o tipo.
- Atualiza sem inserir outra linha e detecta versão desatualizada de uma edição concorrente.
- Impede modelos e setores duplicados; renomear tipo preserva a associação dos modelos.
- Trata valores de fórmula como texto e escapa dados dentro da resposta HTML.
- Valida as origens permitidas para as respostas do transporte.

`node tests/ui.browser.mjs` verifica a interface no Chrome com login e servidor simulados. Ele exercita formulários POST, resposta em iframe interno de origem Google simulada, os dois modos, cadastro de modelo e setor sem sair do inventário, fabricante automático, salvar e próximo, duplicidade, atualização, filtros, desativação, câmera virtual e layout de celular sem overflow horizontal. Também simula uma gravação cuja resposta se perde: a tela não anuncia sucesso, preserva o formulário e identifica o registro existente na tentativa seguinte. Sem configuração, o site bloqueia as gravações e exibe contadores indisponíveis.

**Esses testes não comprovam gravação no Google Sheets real, login OAuth real, comportamento do iframe real do Apps Script ou leitura de etiquetas por câmera física.**

## Diagnóstico HTTP da implantação fornecida

A URL `/exec` fornecida pelo responsável foi acessada sem credenciais. O GET respondeu HTTP 200 com a mensagem de API ativa. Após a configuração do servidor, o POST sem token respondeu `UNAUTHORIZED`, como esperado. O mesmo bloqueio foi confirmado no navegador, usando o site realmente publicado no GitHub Pages e o transporte real por iframe. Nenhum equipamento foi enviado ou gravado por esses testes.

O workflow do GitHub Pages concluiu com sucesso e o site publicado foi conferido em viewport de celular sem rolagem horizontal. O teste com login Google em uma janela automatizada foi bloqueado pelo próprio Google como navegador não seguro; esse bloqueio não foi contornado. O teste de gravação autenticada na planilha real permanece pendente de login no navegador habitual do operador. O diagnóstico temporário de escrita não foi executado e foi removido do código de produção.

Para repetir apenas esse diagnóstico público, execute `node scripts/probe-live.mjs` com acesso à rede. Os HTMLs ficam em `outputs/live/`, fora do Git e do site publicado.

## Teste real obrigatório após a configuração

| Passo | Resultado esperado |
| --- | --- |
| Abrir o Pages sem login | Nenhum dado de equipamentos exposto; operações exigem login |
| Entrar com operador autorizado | Contadores e cadastros carregados da planilha correta |
| Entrar com conta não autorizada | Acesso negado sem dados ou gravações |
| Criar setor e modelo | Linhas nas abas corretas; listas atualizadas |
| Iniciar por setor | Setor aparece permanentemente e fica bloqueado no formulário |
| Ler etiqueta com zeros à esquerda | Código preservado integralmente |
| Criar modelo durante a leitura | Código, patrimônio e observação mantidos; modelo novo selecionado |
| Salvar e próximo | Mensagem somente após escrita; linha confirmada no Sheets; código limpo; setor fixo mantido |
| Repetir o mesmo código | Aviso de equipamento existente; quantidade de linhas inalterada |
| Atualizar setor do duplicado | Mesma linha/ID, novo setor, data/hora original preservadas |
| Salvar no modo individual | Próximo equipamento começa sem setor selecionado |
| Filtrar por patrimônio, setor, tipo e modelo | Resultados corretos e quantidade compatível |
| Dois operadores gravarem o mesmo código | Apenas uma linha; outro operador recebe aviso de duplicidade |
| Dois operadores editarem a mesma versão | Segunda alteração pede recarregar o registro |
| Interromper a rede durante uma gravação | Não afirmar sucesso; consultar o código ao restabelecer a conexão |
| Permissão da câmera negada | Mensagem clara e digitação manual disponível |
| Android e iPhone, quando usados na operação | Testar CODE 128, CODE 39, EAN e QR Code com etiquetas reais |
| Leitor USB/Bluetooth | Captura no campo de código, Enter consulta e move para tipo |
| Fechar câmera ou navegar | Indicador de câmera do aparelho encerra |

Faça o primeiro teste com um equipamento identificável. Se usar um registro artificial, remova somente essa linha manualmente após documentar o resultado; o aplicativo não inclui exclusão de equipamentos.

Registre conta, ID da planilha, implantação, navegador, aparelho e data do teste. Não inclua tokens ou segredos nesse registro. A integração só passa a ser declarada funcional após leitura e escrita reais pelo site, com a linha conferida no Sheets.
