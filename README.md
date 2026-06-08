# Pipeline Roblox

Versão recriada do pipeline, agora dirigida por dados e pronta para persistência no Supabase.

## Arquivos

- `index.html`: estrutura da interface.
- `styles.css`: visual fiel ao layout original.
- `app.js`: renderização, edição, fallback local e integração com Supabase.
- `supabase/schema.sql`: estrutura do banco.

## Como ligar o Supabase

1. Rode o SQL de [`supabase/setup.sql`](/Users/fabioribeiro/Documents/PipelineRoblox/supabase/setup.sql).
2. O frontend já está apontando para:

```txt
SUPABASE_URL=https://fwdhsxteposkwrabedvo.supabase.co
SUPABASE_ANON_KEY=sb_publishable_Kncr6nML7ncL76PomhCk7A_aRIzeAew
```

3. Se quiser trocar de projeto depois, atualize os valores em:

- [`index.html`](/Users/fabioribeiro/Documents/PipelineRoblox/index.html)
- [`demo/index.html`](/Users/fabioribeiro/Documents/PipelineRoblox/demo/index.html)

## Regras já implementadas

- Toggle do topo persiste estado atual da frente.
- Toda mudança de toggle gera um evento em `pipeline_stage_status_events`.
- Históricos podem ser criados e editados por data, inclusive em dias anteriores.
- Quando não há preenchimento para uma data passada, a interface assume `Não preenchido.`.
- Se o Supabase não estiver configurado ou falhar, o app continua operando com `localStorage`.
