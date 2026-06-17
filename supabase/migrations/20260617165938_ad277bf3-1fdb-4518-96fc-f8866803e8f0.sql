
CREATE TABLE IF NOT EXISTS public.esquadro_status_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demanda_id UUID NOT NULL REFERENCES public.esquadro_demandas(id) ON DELETE CASCADE,
  status_anterior_id UUID REFERENCES public.esquadro_status(id),
  status_novo_id UUID NOT NULL REFERENCES public.esquadro_status(id),
  observacao TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.esquadro_status_historico TO authenticated;
GRANT ALL ON public.esquadro_status_historico TO service_role;

ALTER TABLE public.esquadro_status_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read status history" ON public.esquadro_status_historico
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert status history" ON public.esquadro_status_historico
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admin delete status history" ON public.esquadro_status_historico
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_esquadro_status_hist_demanda
  ON public.esquadro_status_historico(demanda_id, created_at DESC);

-- Backfill initial entry per existing demanda
INSERT INTO public.esquadro_status_historico (demanda_id, status_novo_id, created_at)
SELECT d.id, d.status_id, d.created_at
FROM public.esquadro_demandas d
WHERE d.status_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.esquadro_status_historico h WHERE h.demanda_id = d.id
  );
