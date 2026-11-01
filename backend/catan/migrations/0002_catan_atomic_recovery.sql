CREATE TABLE public.catan_lobby_receipts(principal uuid NOT NULL,command_id uuid NOT NULL,op text NOT NULL CHECK(op IN ('create','join')),room_id uuid NOT NULL REFERENCES public.catan_rooms(id),payload_hash text NOT NULL,revision integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(principal,command_id));
GRANT ALL ON public.catan_lobby_receipts TO service_role;
REVOKE ALL ON public.catan_lobby_receipts FROM anon,authenticated;
ALTER TABLE public.catan_lobby_receipts ENABLE ROW LEVEL SECURITY;
INSERT INTO public.catan_lobby_receipts(principal,command_id,op,room_id,payload_hash,revision) SELECT CASE WHEN c.result->>'op'='create' THEN r.host_user_id ELSE r.guest_user_id END,c.command_id,c.result->>'op',c.room_id,c.payload_hash,c.revision FROM public.catan_receipts c JOIN public.catan_rooms r ON r.id=c.room_id WHERE c.result->>'op' IN ('create','join') AND CASE WHEN c.result->>'op'='create' THEN r.host_user_id ELSE r.guest_user_id END IS NOT NULL ON CONFLICT DO NOTHING;
DROP INDEX public.catan_receipts_seat_cmd_uniq;
CREATE FUNCTION public.catan_lobby_retry(p_principal uuid,p_command_id uuid,p_payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.catan_lobby_receipts%rowtype; r public.catan_rooms%rowtype;
BEGIN
 SELECT * INTO c FROM public.catan_lobby_receipts WHERE principal=p_principal AND command_id=p_command_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
 SELECT * INTO r FROM public.catan_rooms WHERE id=c.room_id FOR UPDATE;
 IF (c.op='create' AND r.host_user_id IS DISTINCT FROM p_principal) OR (c.op='join' AND r.guest_user_id IS DISTINCT FROM p_principal) THEN RETURN jsonb_build_object('found',true,'ok',false,'code','room_not_found'); END IF;
 IF r.last_touched_at<now()-interval '7 days' THEN RETURN jsonb_build_object('found',true,'ok',false,'code','session_expired'); END IF;
 IF c.payload_hash<>p_payload_hash THEN RETURN jsonb_build_object('found',true,'ok',false,'code','command_id_conflict'); END IF;
 UPDATE public.catan_rooms SET last_touched_at=now() WHERE id=r.id RETURNING * INTO r;
 RETURN jsonb_build_object('found',true,'ok',true,'room',to_jsonb(r),'receipt',jsonb_build_object('commandId',c.command_id,'revision',c.revision,'accepted',true,'duplicate',true));
END $$;
CREATE FUNCTION public.catan_create_atomic(p_principal uuid,p_command_id uuid,p_payload_hash text,p_name text,p_bot_level text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior jsonb; r public.catan_rooms%rowtype;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_principal::text,0));
 prior:=public.catan_lobby_retry(p_principal,p_command_id,p_payload_hash);
 IF (prior->>'found')::boolean THEN RETURN prior; END IF;
 IF (SELECT count(*) FROM public.catan_rooms WHERE (host_user_id=p_principal OR guest_user_id=p_principal) AND status IN ('waiting','playing') AND last_touched_at>=now()-interval '7 days')>=10 THEN RETURN jsonb_build_object('ok',false,'code','active_limit'); END IF;
 INSERT INTO public.catan_rooms(host_user_id,host_name,bot_level) VALUES(p_principal,p_name,p_bot_level) RETURNING * INTO r;
 INSERT INTO public.catan_lobby_receipts(principal,command_id,op,room_id,payload_hash,revision) VALUES(p_principal,p_command_id,'create',r.id,p_payload_hash,0);
 RETURN jsonb_build_object('ok',true,'room',to_jsonb(r),'receipt',jsonb_build_object('commandId',p_command_id,'revision',0,'accepted',true,'duplicate',false));
END $$;
CREATE FUNCTION public.catan_join_atomic(p_principal uuid,p_command_id uuid,p_payload_hash text,p_room_id uuid,p_name text,p_snapshot jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior jsonb; r public.catan_rooms%rowtype;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_principal::text,0));
 prior:=public.catan_lobby_retry(p_principal,p_command_id,p_payload_hash);
 IF (prior->>'found')::boolean THEN RETURN prior; END IF;
 SELECT * INTO r FROM public.catan_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'code','room_not_found'); END IF;
 IF r.last_touched_at<now()-interval '7 days' THEN RETURN jsonb_build_object('ok',false,'code','session_expired'); END IF;
 IF r.host_user_id=p_principal THEN RETURN jsonb_build_object('ok',false,'code','cannot_join_own_room'); END IF;
 IF r.guest_user_id IS NOT NULL AND r.guest_user_id<>p_principal THEN RETURN jsonb_build_object('ok',false,'code','room_full'); END IF;
 IF r.guest_user_id IS NULL THEN
  IF p_snapshot IS NULL OR (p_snapshot->>'revision')::integer IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'invalid initial snapshot'; END IF;
  UPDATE public.catan_rooms SET guest_user_id=p_principal,guest_name=p_name,snapshot=p_snapshot,status='playing',revision=0,updated_at=now(),last_touched_at=now() WHERE id=p_room_id RETURNING * INTO r;
 ELSE
  UPDATE public.catan_rooms SET last_touched_at=now() WHERE id=p_room_id RETURNING * INTO r;
 END IF;
 INSERT INTO public.catan_lobby_receipts(principal,command_id,op,room_id,payload_hash,revision) VALUES(p_principal,p_command_id,'join',r.id,p_payload_hash,r.revision);
 RETURN jsonb_build_object('ok',true,'room',to_jsonb(r),'receipt',jsonb_build_object('commandId',p_command_id,'revision',r.revision,'accepted',true,'duplicate',false));
END $$;
CREATE FUNCTION public.catan_command_retry(p_room_id uuid,p_principal uuid,p_seat text,p_command_id uuid,p_payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.catan_rooms%rowtype; c public.catan_receipts%rowtype;
BEGIN
 SELECT * INTO r FROM public.catan_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR NOT ((p_seat='p1' AND r.host_user_id=p_principal) OR (p_seat='p2' AND r.guest_user_id=p_principal) OR (p_seat='p3' AND p_principal IS NULL)) THEN RETURN jsonb_build_object('found',true,'ok',false,'code','room_not_found'); END IF;
 IF r.last_touched_at<now()-interval '7 days' THEN RETURN jsonb_build_object('found',true,'ok',false,'code','session_expired'); END IF;
 SELECT * INTO c FROM public.catan_receipts WHERE room_id=p_room_id AND seat=p_seat AND command_id=p_command_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
 IF c.payload_hash<>p_payload_hash THEN RETURN jsonb_build_object('found',true,'ok',false,'code','command_id_conflict','room',to_jsonb(r)); END IF;
 UPDATE public.catan_rooms SET last_touched_at=now() WHERE id=p_room_id RETURNING * INTO r;
 RETURN jsonb_build_object('found',true,'ok',true,'room',to_jsonb(r),'result',c.result,'receipt',jsonb_build_object('commandId',c.command_id,'revision',c.revision,'accepted',c.accepted,'duplicate',true));
END $$;
CREATE FUNCTION public.catan_commit_verified(p_room_id uuid,p_principal uuid,p_seat text,p_command_id uuid,p_payload_hash text,p_expected_revision integer,p_new_snapshot jsonb,p_new_status text,p_accepted boolean,p_receipt_result jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.catan_rooms%rowtype; prior jsonb;
BEGIN
 SELECT * INTO r FROM public.catan_rooms WHERE id=p_room_id FOR UPDATE;
 prior:=public.catan_command_retry(p_room_id,p_principal,p_seat,p_command_id,p_payload_hash);
 IF (prior->>'found')::boolean THEN RETURN prior; END IF;
 IF r.status<>'playing' THEN RETURN jsonb_build_object('ok',false,'code',CASE WHEN r.status='ended' THEN 'game_over' ELSE 'not_started' END); END IF;
 IF r.revision<>p_expected_revision THEN RETURN jsonb_build_object('ok',false,'code','revision_conflict','room',to_jsonb(r)); END IF;
 IF p_accepted AND (p_new_snapshot IS NULL OR (p_new_snapshot->>'revision')::integer IS DISTINCT FROM p_expected_revision+1) THEN RAISE EXCEPTION 'invalid snapshot revision'; END IF;
 INSERT INTO public.catan_receipts(room_id,seat,command_id,payload_hash,revision,accepted,result) VALUES(p_room_id,p_seat,p_command_id,p_payload_hash,p_expected_revision,p_accepted,p_receipt_result);
 UPDATE public.catan_rooms SET snapshot=CASE WHEN p_accepted THEN p_new_snapshot ELSE snapshot END,revision=revision+CASE WHEN p_accepted THEN 1 ELSE 0 END,status=CASE WHEN p_accepted THEN coalesce(p_new_status,status) ELSE status END,updated_at=now(),last_touched_at=now() WHERE id=p_room_id RETURNING * INTO r;
 RETURN jsonb_build_object('ok',true,'room',to_jsonb(r),'result',p_receipt_result,'receipt',jsonb_build_object('commandId',p_command_id,'revision',p_expected_revision,'accepted',p_accepted,'duplicate',false));
END $$;
REVOKE ALL ON FUNCTION public.catan_lobby_retry(uuid,uuid,text),public.catan_create_atomic(uuid,uuid,text,text,text),public.catan_join_atomic(uuid,uuid,text,uuid,text,jsonb),public.catan_command_retry(uuid,uuid,text,uuid,text),public.catan_commit_verified(uuid,uuid,text,uuid,text,integer,jsonb,text,boolean,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.catan_lobby_retry(uuid,uuid,text),public.catan_create_atomic(uuid,uuid,text,text,text),public.catan_join_atomic(uuid,uuid,text,uuid,text,jsonb),public.catan_command_retry(uuid,uuid,text,uuid,text),public.catan_commit_verified(uuid,uuid,text,uuid,text,integer,jsonb,text,boolean,jsonb) TO service_role;
COMMENT ON FUNCTION public.catan_join_room(uuid,uuid,text,jsonb) IS 'DEPRECATED: use catan_join_atomic for principal-bound durable receipts';
COMMENT ON FUNCTION public.catan_commit(uuid,text,uuid,text,integer,jsonb,text,boolean,jsonb) IS 'DEPRECATED: use catan_commit_verified for membership, expiry and stable receipt results';
REVOKE EXECUTE ON FUNCTION public.catan_join_room(uuid,uuid,text,jsonb),public.catan_commit(uuid,text,uuid,text,integer,jsonb,text,boolean,jsonb) FROM service_role;
