-- 1. DETECT: Find potential duplicates using trigram similarity (> 0.65)
-- Prevents duplicate reverse pairs (a < b) and automatically recommends
-- the curated or higher-usage tag as the suggested target.
SELECT 
    t1.id AS tag1_id,
    t1.slug AS tag1_slug,
    t1.usage_count AS tag1_usage,
    t1.is_curated AS tag1_curated,
    t2.id AS tag2_id,
    t2.slug AS tag2_slug,
    t2.usage_count AS tag2_usage,
    t2.is_curated AS tag2_curated,
    ROUND(similarity(t1.slug, t2.slug)::numeric, 3) AS similarity_score,
    CASE 
        WHEN t1.is_curated AND NOT t2.is_curated THEN t1.id
        WHEN t2.is_curated AND NOT t1.is_curated THEN t2.id
        WHEN t1.usage_count >= t2.usage_count THEN t1.id
        ELSE t2.id
    END AS suggested_canonical_id
FROM tags t1
JOIN tags t2 ON t1.id < t2.id
WHERE similarity(t1.slug, t2.slug) >= 0.65
ORDER BY similarity_score DESC, (t1.usage_count + t2.usage_count) DESC;
