REVOKE ALL ON FUNCTION public.catan_join_room(uuid,uuid,text,jsonb),public.catan_commit(uuid,text,uuid,text,integer,jsonb,text,boolean,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.catan_command_retry(p_room_id uuid,p_principal uuid,p_seat text,p_command_id uuid,p_payload_hash text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.catan_rooms%rowtype; c public.catan_receipts%rowtype;
BEGIN
 SELECT * INTO r FROM public.catan_rooms WHERE id=p_room_id FOR UPDATE;
 IF NOT FOUND OR NOT coalesce(((p_seat='p1' AND r.host_user_id=p_principal) OR (p_seat='p2' AND r.guest_user_id=p_principal) OR (p_seat='p3' AND p_principal IS NULL)),false) THEN RETURN jsonb_build_object('found',true,'ok',false,'code','room_not_found'); END IF;
 IF r.last_touched_at<now()-interval '7 days' THEN RETURN jsonb_build_object('found',true,'ok',false,'code','session_expired'); END IF;
 SELECT * INTO c FROM public.catan_receipts WHERE room_id=p_room_id AND seat=p_seat AND command_id=p_command_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false); END IF;
 IF c.payload_hash<>p_payload_hash THEN RETURN jsonb_build_object('found',true,'ok',false,'code','command_id_conflict','room',to_jsonb(r)); END IF;
 UPDATE public.catan_rooms SET last_touched_at=now() WHERE id=p_room_id RETURNING * INTO r;
 RETURN jsonb_build_object('found',true,'ok',true,'room',to_jsonb(r),'result',c.result,'receipt',jsonb_build_object('commandId',c.command_id,'revision',c.revision,'accepted',c.accepted,'duplicate',true));
END $$;
REVOKE ALL ON FUNCTION public.catan_command_retry(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.catan_command_retry(uuid,uuid,text,uuid,text) TO service_role;
