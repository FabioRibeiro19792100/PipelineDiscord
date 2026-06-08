# Pipeline Roblox

Versão recriada do pipeline, agora dirigida por dados e pronta para persistência no Supabase.

## Arquivos

- `index.html`: estrutura da interface.
- `styles.css`: visual fiel ao layout original.
- `app.js`: renderização, edição, fallback local e integração com Supabase.
- `supabase/schema.sql`: estrutura do banco.

## Como ligar o Supabase

1. Crie um projeto no Supabase.
2. Rode o SQL de [`supabase/schema.sql`](/Users/fabioribeiro/Documents/PipelineRoblox/supabase/schema.sql).
3. Antes de abrir o `index.html`, defina as credenciais no escopo global:

```html
<script>
  window.SUPABASE_URL = 'https://SEU-PROJETO.supabase.co';
  window.SUPABASE_ANON_KEY = 'SUA_ANON_KEY';
</script>
```

4. Insira esse bloco logo antes de `<script type="module" src="./app.js"></script>` em [`index.html`](/Users/fabioribeiro/Documents/PipelineRoblox/index.html).

## Regras já implementadas

- Toggle do topo persiste estado atual da frente.
- Toda mudança de toggle gera um evento em `pipeline_stage_status_events`.
- Históricos podem ser criados e editados por data, inclusive em dias anteriores.
- Quando não há preenchimento para uma data passada, a interface assume `Não preenchido.`.
- Se o Supabase não estiver configurado ou falhar, o app continua operando com `localStorage`.
