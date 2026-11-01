CREATE OR REPLACE FUNCTION public.catan_command_retry(p_room_id uuid, p_principal uuid, p_seat text, p_command_id uuid, p_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.catan_commit(p_room_id uuid, p_seat text, p_command_id uuid, p_payload_hash text, p_expected_revision integer, p_new_snapshot jsonb, p_new_status text, p_accepted boolean, p_receipt_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.catan_rooms%rowtype;
  existing public.catan_receipts%rowtype;
begin
  select * into r from public.catan_rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'room_not_found');
  end if;

  select * into existing from public.catan_receipts
   where room_id = p_room_id and seat = p_seat and command_id = p_command_id;
  if found then
    if existing.payload_hash <> p_payload_hash then
      return jsonb_build_object('ok', false, 'code', 'command_id_conflict',
        'revision', r.revision, 'snapshot', r.snapshot, 'status', r.status);
    end if;
    update public.catan_rooms set last_touched_at = now() where id = p_room_id returning * into r;
    return jsonb_build_object('ok', true, 'duplicate', true,
      'revision', r.revision, 'snapshot', r.snapshot, 'status', r.status,
      'receipt', jsonb_build_object('commandId', existing.command_id, 'revision', existing.revision, 'accepted', existing.accepted, 'duplicate', true));
  end if;

  if r.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'revision_conflict',
      'revision', r.revision, 'snapshot', r.snapshot, 'status', r.status);
  end if;

  insert into public.catan_receipts (room_id, seat, command_id, payload_hash, revision, accepted, result)
  values (p_room_id, p_seat, p_command_id, p_payload_hash, p_expected_revision, p_accepted, p_receipt_result);

  if p_accepted then
    update public.catan_rooms
       set snapshot = p_new_snapshot, revision = p_expected_revision + 1,
           status = coalesce(p_new_status, status),
           updated_at = now(), last_touched_at = now()
     where id = p_room_id
     returning * into r;
  else
    update public.catan_rooms set last_touched_at = now() where id = p_room_id returning * into r;
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false,
    'revision', r.revision, 'snapshot', r.snapshot, 'status', r.status,
    'receipt', jsonb_build_object('commandId', p_command_id, 'revision', p_expected_revision, 'accepted', p_accepted, 'duplicate', false));
end $function$;

CREATE OR REPLACE FUNCTION public.catan_commit_verified(p_room_id uuid, p_principal uuid, p_seat text, p_command_id uuid, p_payload_hash text, p_expected_revision integer, p_new_snapshot jsonb, p_new_status text, p_accepted boolean, p_receipt_result jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.catan_create_atomic(p_principal uuid, p_command_id uuid, p_payload_hash text, p_name text, p_bot_level text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE prior jsonb; r public.catan_rooms%rowtype;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_principal::text,0));
 prior:=public.catan_lobby_retry(p_principal,p_command_id,p_payload_hash);
 IF (prior->>'found')::boolean THEN RETURN prior; END IF;
 IF (SELECT count(*) FROM public.catan_rooms WHERE (host_user_id=p_principal OR guest_user_id=p_principal) AND status IN ('waiting','playing') AND last_touched_at>=now()-interval '7 days')>=10 THEN RETURN jsonb_build_object('ok',false,'code','active_limit'); END IF;
 INSERT INTO public.catan_rooms(host_user_id,host_name,bot_level) VALUES(p_principal,p_name,p_bot_level) RETURNING * INTO r;
 INSERT INTO public.catan_lobby_receipts(principal,command_id,op,room_id,payload_hash,revision) VALUES(p_principal,p_command_id,'create',r.id,p_payload_hash,0);
 RETURN jsonb_build_object('ok',true,'room',to_jsonb(r),'receipt',jsonb_build_object('commandId',p_command_id,'revision',0,'accepted',true,'duplicate',false));
END $function$;

CREATE OR REPLACE FUNCTION public.catan_join_atomic(p_principal uuid, p_command_id uuid, p_payload_hash text, p_room_id uuid, p_name text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;

CREATE OR REPLACE FUNCTION public.catan_join_room(p_room_id uuid, p_guest_user_id uuid, p_guest_name text, p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.catan_rooms%rowtype;
begin
  select * into r from public.catan_rooms where id = p_room_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'room_not_found');
  end if;
  if r.host_user_id = p_guest_user_id then
    return jsonb_build_object('ok', false, 'code', 'already_host');
  end if;
  if r.guest_user_id is not null then
    if r.guest_user_id = p_guest_user_id then
      return jsonb_build_object('ok', true, 'duplicate', true, 'revision', r.revision, 'snapshot', r.snapshot, 'status', r.status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'room_full');
  end if;
  update public.catan_rooms
     set guest_user_id = p_guest_user_id, guest_name = p_guest_name,
         snapshot = p_snapshot, status = 'playing', revision = 0,
         updated_at = now(), last_touched_at = now()
   where id = p_room_id
   returning * into r;
  return jsonb_build_object('ok', true, 'duplicate', false, 'revision', r.revision, 'snapshot', r.snapshot, 'status', r.status);
end $function$;

CREATE OR REPLACE FUNCTION public.catan_lobby_retry(p_principal uuid, p_command_id uuid, p_payload_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$;
