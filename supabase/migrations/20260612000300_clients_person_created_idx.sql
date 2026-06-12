-- Missing index on the clients hot path (PRE_LAUNCH_ROADMAP §1 #11).
--
-- clients already has (person_id, updated_at desc) and (person_id, sale_status),
-- but several producer views sort a producer's book by created_at (newest
-- first). Without a matching index that's a per-person sort on every load. Add
-- the (person_id, created_at desc) composite to cover it.

create index if not exists clients_person_created_idx
  on clients(person_id, created_at desc);
