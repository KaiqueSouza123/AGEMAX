# Plataforma Agemax

Sistema interno da Agemax Marketing: produção de conteúdo, calendários dos clientes, equipe e cobranças.

## Como funciona
- **Site:** React + Vite, publicado na Vercel a partir deste repositório.
- **Banco e login:** Supabase (projeto `plataforma-agemax`, região São Paulo).
- **Perfis:** Dono (acesso total) e Funcionário (vê e entrega só as próprias demandas).
- **Regras no banco:** o funcionário não aprova, não altera o post e não entrega sem link. A data de entrega é registrada pelo próprio banco.

## Acesso
Só entra quem tem o e-mail cadastrado na aba **Equipe**. A pessoa usa **Primeiro acesso** na tela de login, com esse e-mail.

## Rodar localmente
```
npm install
npm run dev
```
