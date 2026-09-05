# Agenda Sacramental

App web mobile-friendly para preparar a agenda da reunião sacramental da unidade.

Desenvolvido com 🩵 por **Alta Software**. Todos os direitos reservados, 2026.

> Este aplicativo **não** é um aplicativo oficial de A Igreja de Jesus Cristo dos Santos dos Últimos Dias.

## Stack

- HTML, JavaScript, CSS, Bootstrap 5, Bootstrap Icons
- PHP + SQLite
- Senhas com `password_hash` / `password_verify`
- PWA (`manifest.json` + `sw.js`)
- PDF via html2pdf.js (no iPhone usa impressão nativa)

## Funcionalidades

- **Autenticação multiusuário** — login, primeiro acesso (cadastro da unidade), esqueci minha senha
- **Isolamento por unidade** — cada unidade vê apenas as próprias agendas
- **Agenda do domingo** — estrutura completa da reunião sacramental (presidência, anúncios, hinos, assuntos da unidade, sacramento, discursos, orações)
- **Busca de hinos** — hinário 1991 + *Hinos — Para o Lar e para a Igreja*, com sugestões por papel e sem repetição em 6 semanas
- **Calendário mensal** — domingos coloridos; datas futuras com agenda salva em vermelho; semana começa na segunda (configurável)
- **Histórico** e **Painel da unidade** — frequência, temas, hinos e oradores
- **PDF** da agenda
- **Configurações** — nomes preferidos, horário (Brasília), usuários da unidade
- **Admin** (`/admin/`) — acessos e estatísticas agregadas (sem nomes de pessoas)
- **LGPD** — banner de consentimento e política de privacidade
- **Sessão persistente** — permanece logado por até 90 dias (configurável), mesmo após fechar o navegador

## Datas e horário

- Datas exibidas como **dd/mm/aaaa**
- Horários no **Horário Oficial de Brasília** (`America/Sao_Paulo`)
- Internamente o banco continua com ISO (`Y-m-d`)

## Requisitos

- PHP 8+ (recomendado; funciona em 7.4+ com cuidado)
- Extensões: PDO SQLite, `json`, `mbstring`, `openssl` (e-mail)
- Apache com `mod_rewrite` e, de preferência, `mod_headers`
- HTTPS em produção (cookies seguros no celular)

## Instalação local (WAMP / XAMPP)

1. Clone ou copie o projeto para `www/sacramental`.
2. Copie a configuração:

```bash
cp includes/config.example.php includes/config.local.php
```

3. Edite `includes/config.local.php`:
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — painel `/admin/`
   - `ADMIN_SESSION_KEY` — chave longa e aleatória
   - `SESSION_LIFETIME_DAYS` — dias logado (padrão `90`)
   - SMTP (`MAIL_*`) se quiser “esqueci minha senha”
4. Acesse `http://altasoftware.com.br/sacramental/`.
5. Use **Primeiro acesso** e cadastre número e nome da unidade.
6. Unidades já existentes **não** podem ser re-registradas; líderes adicionam usuários em **Configurações**.

O banco SQLite é criado automaticamente em `data/sacramental.db` no primeiro uso.

JS e CSS usam versionamento **automático** (`?v=` com hash do arquivo). Basta enviar o arquivo novo — o celular baixa a versão atualizada sem incrementar nada no config.

## Publicar no HostGator (ou similar)

### Enviar

Código PHP/JS/CSS, `assets/`, `data/hymns.json`, `data/.htaccess`, `includes/` (exceto `config.local.php` do seu PC), `.htaccess`, `manifest.json`, `sw.js`, `privacidade.php`.

### Não enviar

| Item | Motivo |
|------|--------|
| `includes/config.local.php` | Senhas e SMTP |
| `data/*.db` e `data/*.db-*` | Banco local de testes |
| `.env` / `.env.*` | Segredos |
| `.git/`, `.cursor/`, IDE | Ferramentas locais |
| `scripts/build_hymns.py` | Só para gerar o JSON de hinos |

O `.gitignore` já ignora credenciais e o banco.

### No servidor

1. Suba os arquivos.
2. Crie `includes/config.local.php` a partir de `config.example.php` com senhas **novas** de produção.
3. Garanta escrita em `data/` (criação do SQLite).
4. Acesse o domínio, cadastre a unidade com **Primeiro acesso**.

Ao publicar JS/CSS novos, só envie os arquivos: o `?v=` muda sozinho com o conteúdo do arquivo (não é preciso alterar o config).

## Estrutura principal

```
sacramental/
├── index.php              # App (login + agenda)
├── privacidade.php
├── manifest.json / sw.js  # PWA
├── admin/                 # Painel administrativo
├── api/                   # auth, meetings, hymns, users, dashboard, log
├── includes/              # config, auth, db, site, mail, hymns…
├── data/                  # hymns.json + sacramental.db (não versionado)
├── css/ / js/ / assets/
└── scripts/               # build_hymns.py (opcional)
```

## Segurança

- Credenciais só em `config.local.php` (fora do Git)
- `.htaccess` bloqueia acesso direto a `includes/`, `data/` e arquivos `.db` / `*.local.php`
- CSRF nas ações autenticadas
- Sessão HTTP-only; cookie renovado a cada uso
- Admin separado, sem expor nomes pessoais nas estatísticas

## Licença

Proprietário — Alta Software, 2026. Todos os direitos reservados.
