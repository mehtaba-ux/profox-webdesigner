-- Module 20 — protect capstone result and evidence from client-side manipulation.

create or replace function public.protect_final_certification_progress_write()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_slug text; v_rpc text:=coalesce(current_setting('profox.training_final_certification_rpc',true),''); begin
 if public.is_admin() then return new; end if;
 select slug into v_slug from public.training_modules where id=new.module_id;
 if v_slug<>'final-certification' then return new; end if;
 if v_rpc='1' then return new; end if;
 if tg_op='INSERT' then
   if new.status in('Submitted','Retry Required','Passed','Completed') or new.score is not null or new.completed_at is not null or new.reviewed_by is not null or new.reviewed_at is not null or new.review_status is not null then
     raise exception 'Final Certification status and scores are controlled by the secure capstone workflow.';
   end if;
 else
   if new.user_id is distinct from old.user_id or new.module_id is distinct from old.module_id then raise exception 'Final Certification ownership and module are immutable.'; end if;
   if new.status is distinct from old.status and new.status in('Submitted','Retry Required','Passed','Completed') then raise exception 'Final Certification status is controlled by the secure capstone workflow.'; end if;
   if new.score is distinct from old.score or new.completed_at is distinct from old.completed_at or new.reviewed_by is distinct from old.reviewed_by or new.reviewed_at is distinct from old.reviewed_at or new.review_status is distinct from old.review_status or new.feedback is distinct from old.feedback then
     raise exception 'Final Certification result/review fields are controlled by the secure capstone workflow.';
   end if;
 end if;
 return new;
end;$$;
revoke all on function public.protect_final_certification_progress_write() from public,anon,authenticated;
drop trigger if exists trg_protect_final_certification_progress_write on public.user_training_progress;
create trigger trg_protect_final_certification_progress_write before insert or update on public.user_training_progress for each row execute function public.protect_final_certification_progress_write();

create or replace function public.protect_final_certification_assignment_write()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_slug text; v_rpc text:=coalesce(current_setting('profox.training_final_certification_rpc',true),''); begin
 if public.is_admin() then return new; end if;
 select slug into v_slug from public.training_modules where id=new.module_id;
 if v_slug<>'final-certification' then return new; end if;
 if v_rpc='1' then return new; end if;
 raise exception 'Final Certification evidence is controlled by the secure capstone workflow.';
end;$$;
revoke all on function public.protect_final_certification_assignment_write() from public,anon,authenticated;
drop trigger if exists trg_protect_final_certification_assignment_write on public.training_assignments;
create trigger trg_protect_final_certification_assignment_write before insert or update on public.training_assignments for each row execute function public.protect_final_certification_assignment_write();
