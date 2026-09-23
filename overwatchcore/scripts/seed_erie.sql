-- Erie Community Center, 42.5 m due north of the mobile mock ping
-- (40.0503, -105.0497). ST_DWithin uses meters on geography, and the
-- 100 m handler radius must include this row.
--
-- ST_SetSRID(ST_MakePoint(-105.0485, 40.0512), 4326) is about 143 m from
-- that same ping, so it is intentionally not the seeded target.
INSERT INTO entities (id, name, geom)
VALUES (
    '6f1c2a40-7b3e-4d1a-9c55-000000000001',
    'Erie Community Center',
    ST_Project(
        ST_SetSRID(ST_MakePoint(-105.0497, 40.0503), 4326)::geography,
        42.5,
        0
    )
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    geom = EXCLUDED.geom;
