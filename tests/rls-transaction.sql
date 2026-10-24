-- Only run on an empty MIMMO test project. Every write is rolled back.
begin;
do $test$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid();
 payload jsonb; payload_b jsonb; n integer; passed text[]:=array[]::text[];
begin
 if exists(select 1 from public.private_projects) or exists(select 1 from auth.users) then
  raise exception 'Safety guard: test requires an empty database';
 end if;
 insert into auth.users(id) values(a),(b);
 select jsonb_build_object('id',p,'url','https://example.invalid/fictitious-test',
  'facts',jsonb_object_agg(k,jsonb_build_object('value','','source','','status','missing')))
 into payload from unnest(array['title','city','price','area','rooms','description']) k;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 if public.save_private_project(p,0,payload)<>1 then raise exception 'FAIL save'; end if;
 select count(*) into n from public.private_projects where id=p and owner_id=a;
 if n<>1 then raise exception 'FAIL owner/read'; end if;
 if public.save_private_project(p,1,payload)<>2 then raise exception 'FAIL update'; end if;
 passed:=array_append(passed,'Owner creates, reads, updates; version increments');
 begin
  perform public.save_private_project(p,1,payload); raise exception 'FAIL stale version';
 exception when serialization_failure then null; end;
 passed:=array_append(passed,'Stale version refused');
 begin
  perform public.save_private_project(p,2,jsonb_set(payload,'{facts,title,status}','"verified"'));
  raise exception 'FAIL forged verification';
 exception when check_violation then null; end;
 begin
  perform public.save_private_project(p,2,jsonb_set(payload,'{investment}','{"observations":[{"status":"verified","value":"forged"}]}'::jsonb));
  raise exception 'FAIL forged nested observation';
 exception when check_violation then null; end;
 passed:=array_append(passed,'Forged verification refused');
 begin
  update public.private_projects set owner_id=b where id=p and owner_id=a;
  raise exception 'FAIL owner transfer';
 exception when insufficient_privilege then null; end;
 passed:=array_append(passed,'Ownership transfer refused');
 reset role;
 perform set_config('request.jwt.claim.sub',b::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
 set local role authenticated;
 select count(*) into n from public.private_projects where id=p;
 if n<>0 then raise exception 'FAIL foreign read'; end if;
 begin
  perform public.save_private_project(p,2,payload); raise exception 'FAIL foreign write';
 exception when serialization_failure then null; end;
 delete from public.private_projects where id=p and owner_id=a;
 get diagnostics n=row_count;
 if n<>0 then raise exception 'FAIL foreign deletion'; end if;
 passed:=array_append(passed,'Bob cannot read, overwrite or delete Alice project');
 payload_b:=jsonb_set(payload,'{id}',to_jsonb(pb));
 if public.save_private_project(pb,0,payload_b)<>1 then raise exception 'FAIL Bob save'; end if;
 select count(*) into n from public.private_projects;
 if n<>1 then raise exception 'FAIL Bob project visibility'; end if;
 passed:=array_append(passed,'Bob creates his own project and sees only his own');
 reset role;
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{}',true);
 set local role anon;
 begin
  perform 1 from public.private_projects; raise exception 'FAIL anonymous read';
 exception when insufficient_privilege then null; end;
 begin
  perform public.save_private_project(p,2,payload); raise exception 'FAIL anonymous save';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.private_projects where id=pb and owner_id=b; raise exception 'FAIL anonymous deletion';
 exception when insufficient_privilege then null; end;
 passed:=array_append(passed,'Anonymous read, save and deletion refused');
 reset role;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 select count(*) into n from public.private_projects where id=pb;
 if n<>0 then raise exception 'FAIL Alice reads Bob'; end if;
 passed:=array_append(passed,'Alice cannot read Bob project');
 select count(*) into n from public.private_projects where id=p and version=2;
 if n<>1 then raise exception 'FAIL unauthorized attempts damaged project'; end if;
 delete from public.private_projects where id=p and owner_id=a;
 get diagnostics n=row_count;
 if n<>1 then raise exception 'FAIL owner deletion'; end if;
 passed:=array_append(passed,'Owner deletion succeeds after unauthorized attempts');
 reset role;
 perform set_config('mimmo.test_results',array_to_json(passed)::text,true);
end
$test$;
select current_setting('mimmo.test_results')::json as passed_tests;
rollback;
