# Anne Lopes Advocacia

Landing page estatica criada a partir dos templates visuais originais da cliente.

## Estrutura

- `public/index.html`: pagina publicada.
- `public/styles.css`: estilos, responsividade e animacoes.
- `public/script.js`: links de WhatsApp, navegacao suave, FAQ e protecao contra overflow.
- `public/assets/`: imagens finais usadas no site.
- `docs/template-original/`: templates originais preservados.
- `docs/briefing/`: briefing usado para orientar o projeto.
- `scripts/`: validacoes locais e servidor estatico.

## Atualizar templates

1. Substitua o PNG original em `docs/template-original/`.
2. Copie a versao final correspondente para `public/assets/` mantendo o mesmo nome.
3. Rode `npm run validate`.
4. Rode `npm run browser-check` com o servidor local aberto.

## Comandos

```bash
npm run validate
npm run check:js
npm run serve
npm run browser-check
```

## Deploy

O projeto publica a pasta `public/`, conforme `vercel.json`.
