CREATE POLICY "students upload own recitations" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'recitations' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "read own recitations or teacher" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recitations' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_teacher(auth.uid())));

CREATE POLICY "delete own recitations or teacher" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'recitations' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_teacher(auth.uid())));