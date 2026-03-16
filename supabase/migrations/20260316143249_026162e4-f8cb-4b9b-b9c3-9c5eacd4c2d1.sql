INSERT INTO public.esquadro_motivos_nao_trabalho (nome)
SELECT 'Atividades Administrativas'
WHERE NOT EXISTS (SELECT 1 FROM public.esquadro_motivos_nao_trabalho WHERE nome = 'Atividades Administrativas');