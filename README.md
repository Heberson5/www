# www.sauberlich.com.br — Sauberlich System

Site principal da **Sauberlich System**: divulga todos os sistemas (Pesquisa NPS, Chamados, WhatsAtendente e Treinamentos), com vídeo e simulador de cada um, e vende cada sistema de forma individual (plano, cobrança e cancelamento próprios).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | O site inteiro (HTML, CSS, JS e as imagens reais embutidas). Não precisa de build. |
| `Dockerfile` | Serve o site com nginx, no mesmo padrão dos outros sistemas. |

## Como rodar

```bash
docker build -t sauberlich-www .
docker run -p 8080:80 sauberlich-www   # http://localhost:8080
```

Ou abra `index.html` direto no navegador.

## Editor administrativo (estado atual: protótipo)

No rodapé, o botão **Área administrativa** abre o editor: arrastar seções e blocos, editar textos, preços, planos e imagens, trocar cores e fonte, definir o link do vídeo de cada sistema e pré-visualizar em desktop, tablet e celular.

Atenção: neste protótipo o login aceita qualquer senha e as edições ficam salvas só no navegador de quem edita. Antes de ir para produção é preciso:

1. Login real, só para o administrador.
2. Gravar o conteúdo editado em um banco de dados (para todos os visitantes verem).
3. Checkout real por sistema (gateway de pagamento) no lugar da tela de demonstração.

## Vídeo e simulador

- **Vídeo:** no editor (aba *Sistemas*), cole o link do YouTube, Vimeo ou de um arquivo MP4 de cada sistema. Sem link, o site mostra um vídeo demonstrativo de exemplo.
- **Simulador:** cada sistema tem uma demonstração interativa com dados fictícios, que não toca nos sistemas reais.

## Imagens

Pesquisa NPS e Treinamentos usam capturas de tela reais com dados de demonstração. As telas de Chamados e WhatsAtendente são recriações; troque por capturas reais no editor (clique na imagem).
