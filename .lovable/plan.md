

## Problema

O usuário "adroaldo" aparece na página de **Pendências de Horas** (pois existe um registro em `esquadro_profiles` com `role='arquiteta'` e `ativo=true`), mas **não aparece** na tabela de Usuários em Configurações. Isso indica que o perfil foi criado automaticamente (provavelmente por um trigger `on_auth_user_created`) e pode estar oculto por uma política de RLS, ou simplesmente não ter o campo `nome` preenchido, dificultando a identificação.

## Plano

### 1. Alterar role padrão para novos perfis
- **`src/components/config/ConfigUsuarios.tsx`**: Mudar o valor inicial do campo `role` no formulário de `'arquiteta'` para `'comum'`.
- **Banco de dados (SQL no Supabase)**: Alterar o default da coluna `role` e o trigger de criação automática de perfil para usar `'comum'`:
  ```sql
  ALTER TABLE esquadro_profiles ALTER COLUMN role SET DEFAULT 'comum';
  ```
  E atualizar o trigger (se existir) que insere perfis no `on_auth_user_created` para definir `role = 'comum'`.

### 2. Garantir visibilidade de todos os perfis na tabela de Configurações
- **`src/components/config/ConfigUsuarios.tsx`**: A query atual já busca todos os perfis sem filtro de `ativo` ou `role`. Se o problema for RLS, não há como resolver no frontend — será necessário ajustar a policy no Supabase para permitir que admins vejam todos os registros de `esquadro_profiles`.
- Adicionar `overflow-x-auto` na tabela para garantir que colunas como "Ativo" e "Editar" não fiquem cortadas em telas menores.

### 3. Corrigir o perfil do adroaldo agora
- Como paliativo imediato, executar no Supabase SQL Editor:
  ```sql
  UPDATE esquadro_profiles
  SET role = 'comum'
  WHERE email = 'adroaldo@youngempreendimentos.com.br';
  ```
  Isso remove ele das pendências de horas imediatamente.

### Arquivos alterados
- `src/components/config/ConfigUsuarios.tsx` — default do form + scroll horizontal

