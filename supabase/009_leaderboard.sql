BEGIN;

-- Share only the fields needed by the group leaderboard. Detailed profiles,
-- answers and personal history retain their existing access restrictions.
CREATE OR REPLACE FUNCTION public.xp_leaderboard() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.is_linguanest_member() THEN RAISE EXCEPTION 'Không có quyền'; END IF;
 RETURN (
  WITH totals AS (
   SELECT p.id,p.display_name,p.avatar_key,
    COALESCE((SELECT sum(xp) FROM public.user_progress WHERE user_id=p.id),0)+
    COALESCE((SELECT sum(least(correct_count,total_count)*5) FROM public.quiz_attempts WHERE user_id=p.id),0)+
    COALESCE((SELECT sum(score*5) FROM public.exam_runs WHERE user_id=p.id AND status='graded'),0) AS xp
   FROM public.profiles p WHERE p.is_active AND NOT p.must_change_password
  ), ranked AS (
   SELECT *,dense_rank() OVER (ORDER BY xp DESC) AS rank FROM totals
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,
   'avatar_key',avatar_key,'xp',xp,'rank',rank) ORDER BY xp DESC,display_name,id),'[]'::jsonb)
  FROM ranked
 );
END $$;

REVOKE ALL ON FUNCTION public.xp_leaderboard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xp_leaderboard() TO authenticated;

COMMIT;
