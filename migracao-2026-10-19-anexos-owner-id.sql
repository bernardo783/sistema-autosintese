-- APLICADA em 19/10/2026 (migração anexos_dono_owner_id).
-- Anexo acima de 6 MB falhava pra todo mundo (Gabriel 19/10, "Lara - Interior 1910.mp4", 17 MB): o envio
-- em partes (TUS) grava o dono só em storage.objects.owner_id (texto); as regras dos anexos olhavam só a
-- coluna antiga owner (uuid), então a gravação batia na RLS (o servidor devolve 400 com "403" no corpo e o
-- app traduzia como "sessão expirou"). O envio direto (até 6 MB) preenche as duas e passava.
drop policy if exists anexos_bucket_sobem on storage.objects;
create policy anexos_bucket_sobem on storage.objects for insert to public
  with check (bucket_id = 'anexos' and is_aprovado() and coalesce(owner_id, owner::text) = auth.uid()::text);
drop policy if exists rs_anexos_bucket_sobem on storage.objects;
create policy rs_anexos_bucket_sobem on storage.objects for insert to authenticated
  with check (bucket_id = 'anexos' and rs_lista() is not null and coalesce(owner_id, owner::text) = auth.uid()::text and rs_minha_pasta(name));
drop policy if exists anexos_bucket_apagam on storage.objects;
create policy anexos_bucket_apagam on storage.objects for delete to public
  using (bucket_id = 'anexos' and (coalesce(owner_id, owner::text) = auth.uid()::text or is_master()));
-- suporte_anexar passou a conferir o dono por coalesce(o.owner_id, o.owner::text) = auth.uid()::text
-- (corpo completo no banco: pg_get_functiondef('suporte_anexar')).
