# Nexus Next Frontend

Frontend React experimental do Nexus, executado fora do conjunto de servicos Rails/Vue atual.

```bash
docker compose up --build
```

- Nova UI: http://localhost:5173
- Nexus atual: http://localhost:3000/app

Este app consome `@igaralead/ui` a partir de `vendor/igaraui/`, mantendo o design system como fonte de componentes e tokens.

Quando o IgaraUI for atualizado, gere novamente `vendor/igaraui/igaralead-ui-0.1.0.tgz` e reinicie o compose com rebuild. O container roda `npm install` no start para atualizar o volume `node_modules` com o tarball vendorizado mais recente.
