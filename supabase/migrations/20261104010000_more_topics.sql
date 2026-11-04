-- Six more topics, and the admin's preferred order for all ten.
insert into public.topics (slug, name, sort) values
  ('knowledge', '知識科普', 5),
  ('news', '新聞時事', 6),
  ('fortune', '命理', 7),
  ('business', '商業財經', 8),
  ('entertainment', '娛樂', 9),
  ('music', '音樂', 10)
on conflict (slug) do update set name = excluded.name, sort = excluded.sort;

update public.topics set sort = case slug
  when 'cooking' then 1
  when 'health' then 2
  when 'travel' then 3
  when 'history' then 4
  else sort
end;
