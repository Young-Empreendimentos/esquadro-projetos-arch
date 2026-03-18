-- Add update/insert/delete policies using is_admin for esquadro config tables

CREATE POLICY "esquadro_empreendimentos_admin_update_via_profiles"
ON public.esquadro_empreendimentos
FOR UPDATE TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "esquadro_empreendimentos_admin_insert_via_profiles"
ON public.esquadro_empreendimentos
FOR INSERT TO authenticated
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "esquadro_empreendimentos_admin_delete_via_profiles"
ON public.esquadro_empreendimentos
FOR DELETE TO authenticated
USING (is_admin(auth.uid()));

CREATE POLICY "esquadro_status_admin_via_profiles"
ON public.esquadro_status
FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "esquadro_tipos_admin_via_profiles"
ON public.esquadro_tipos_projeto
FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "esquadro_motivos_admin_via_profiles"
ON public.esquadro_motivos_nao_trabalho
FOR ALL TO authenticated
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));