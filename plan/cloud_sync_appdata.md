# Sincronização automática na pasta escondida do Drive

## TL;DR

O jogo guardava o progresso num ficheiro visível no Google Drive do utilizador e só o
enviava quando alguém carregava num botão. Mudámos duas coisas: o ficheiro passa a viver
na **pasta de dados da aplicação** (uma área escondida e exclusiva deste jogo dentro do
Drive), e a sincronização passa a ser **automática** — ao abrir o jogo e sempre que os
dados mudam. O utilizador só vê o Google uma vez, quando liga a conta.

A pergunta que deu origem a isto foi: "dá para guardar na memória partilhada do Chrome,
a que sincroniza pela conta Google?". Não dá. Essa memória é o `chrome.storage.sync` e só
existe para **extensões** do Chrome. Uma página web não lhe toca, e não há nenhuma API que
deixe um site ler o que o Chrome sincroniza (marcadores, palavras-passe, etc.). O Drive é
a forma mais próxima: sincroniza pela conta Google do utilizador, sem servidor nosso.

## O que mudou

- [x] **Âmbito OAuth**: `drive.file` → `drive.appdata` (`js/config.js`).
      O ficheiro deixa de aparecer no Drive do utilizador e nenhuma outra app o consegue ler.
      O ecrã de consentimento passa a dizer "ver e gerir os seus próprios dados de configuração"
      em vez de falar em ficheiros do Drive.
- [x] **Sincronização automática** (`js/cloud-sync.js`, reescrito):
      - ao abrir o jogo (token pedido em silêncio, sem ecrã do Google);
      - 4 segundos depois de qualquer alteração local (agrupa as várias escritas do fim de
        um estágio num só envio);
      - quando o jogo volta a ficar visível, e um envio imediato quando é escondido/fechado.
- [x] **Aviso de alteração local** (`js/storage.js`): `onLocalChange()`. Todas as escritas
      passam pela mesma função `write()`, por isso basta avisar aí (mais o apagar de um
      jogador e a troca de jogador activo).
- [x] **Interface** (`js/app.js`): o ecrã da nuvem mostra o estado real (a sincronizar /
      ligada / precisa de nova ligação) e o botão na lista de jogadores fica com ⚠️ quando
      é preciso agir.
- [x] **Versão da cache do service worker** subida para `v4`, senão os telemóveis ficavam
      com o código antigo.

## Decisões

**Quem ganha quando os dois lados mudaram.** Guardamos, em cada telemóvel, a data da cópia
remota que já temos (`td_last_sync_v1`) e a data da última alteração local
(`td_local_change_v1`). A comparação dá quatro casos: só a nuvem mudou → trazer; só o
telemóvel mudou → enviar; nenhum mudou → nada; ambos mudaram → **ganha o telemóvel**. A
razão é a criança: é aqui que ela está a jogar agora, e perder as estrelas que acabou de
ganhar é o pior resultado possível. A cópia da nuvem continua acessível pelo botão
"Restaurar".

**Excepção: a primeira ligação.** Se o telemóvel nunca sincronizou e já há jogo feito dos
dois lados, nenhuma escolha automática é segura — apagaríamos o progresso de outro
dispositivo. Nesse caso o jogo pergunta: "usar os dados da conta Google" ou "usar os deste
telemóvel".

**Nunca substituir dados a meio de uma ronda.** A interface diz à sincronização quando é
seguro (`setApplyGuard`). A meio de um estágio, de um teste ou de uma revisão, a cópia da
nuvem fica para depois.

**Apagar sincroniza.** Ao aplicar a cópia da nuvem, as chaves locais que já lá não existem
são removidas. Sem isto, apagar um jogador num telemóvel nunca o apagava nos outros.

## Limitação conhecida

O pedido de token em silêncio (`prompt: 'none'`) usa uma janela do Google que alguns
browsers bloqueiam quando não parte de um toque do utilizador. Quando isso acontece, o
jogo não insiste: marca o estado como "precisa de nova ligação", continua a guardar tudo
localmente, e mostra ⚠️ no botão da nuvem. Um toque em "Voltar a ligar a conta" resolve.
O token do Google dura uma hora; a renovação usa o mesmo caminho.

## Revisão

Testado com um Drive e um Google Identity Services falsos, no browser
(`plan/` não guarda os ficheiros de teste; ver o histórico da sessão). 24 verificações,
todas a passar:

- telemóvel novo sem nada na nuvem → envia;
- telemóvel novo e vazio com dados na nuvem → traz;
- primeira ligação com dados diferentes dos dois lados → pergunta, sem mexer em nenhum lado;
- escolha do utilizador aplicada nos dois sentidos;
- nada mudou → nenhum pedido;
- alteração local → envia; nuvem mais recente → traz;
- a meio de uma ronda → adiado, e aplicado logo a seguir;
- ambos mudaram depois de uma sincronização → ganha o telemóvel;
- jogador apagado na nuvem → progresso órfão desaparece localmente;
- renovação silenciosa recusada → estado "precisa de nova ligação", sem perder dados.

Verificado também no jogo real: arranca sem erros na consola, cria jogador, regista a data
da alteração local, e o ecrã da nuvem mostra os três estados (não ligada, precisa de nova
ligação, e o aviso ⚠️ na lista de jogadores).

## Falta fazer (fora do código)

Criar o cliente OAuth na Google Cloud Console e colar o Client ID em `js/config.js`.
Os passos estão em comentário no topo desse ficheiro.
