CREATE POLICY "Admins can delete pautas"
ON public.esquadro_comentarios_pauta
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM esquadro_profiles
    WHERE esquadro_profiles.id = auth.uid()
    AND esquadro_profiles.role = 'admin'
  )
);