-- Personal avatars are private R2 objects, separate from teaching materials.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_key text;

-- Only the Worker may replace the key. Locking returns the actual previous
-- object even when two devices change the same avatar concurrently.
CREATE OR REPLACE FUNCTION public.replace_profile_avatar(p_user uuid, p_key text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous text;
BEGIN
 IF p_key IS NOT NULL AND p_key !~ ('^avatars/' || p_user::text || '/[a-f0-9-]{36}\.(jpg|png|webp)$') THEN
  RAISE EXCEPTION 'Khóa ảnh đại diện không hợp lệ.';
 END IF;
 SELECT avatar_key INTO previous FROM public.profiles
 WHERE id=p_user AND is_active AND NOT must_change_password FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tài khoản không có quyền cập nhật ảnh đại diện.'; END IF;
 UPDATE public.profiles SET avatar_key=p_key WHERE id=p_user;
 RETURN previous;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_profile_avatar(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.replace_profile_avatar(uuid,text) TO service_role;
