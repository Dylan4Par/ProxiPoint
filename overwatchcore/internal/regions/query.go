package regions

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// lookupSQL tests strict boundary membership with ST_Contains. A positive
// tolerance adds ST_DWithin on geography so adjacent street frontage still
// matches without changing the stored polygon. Ancestors are pulled in
// through parent_region_id. Results are ordered smallest area first.
const lookupSQL = `
WITH RECURSIVE hits AS (
    SELECT
        r.id,
        r.name,
        r.region_type,
        r.parent_region_id,
        ST_Area(r.geom::geography) AS area_square_meters
    FROM regions r
    WHERE ST_Contains(
        r.geom,
        ST_SetSRID(ST_Point($1, $2), 4326)
    )
    OR (
        $3 > 0
        AND ST_DWithin(
            r.geom::geography,
            ST_SetSRID(ST_Point($1, $2), 4326)::geography,
            $3
        )
    )
    UNION
    SELECT
        parent.id,
        parent.name,
        parent.region_type,
        parent.parent_region_id,
        ST_Area(parent.geom::geography) AS area_square_meters
    FROM regions parent
    JOIN hits ON parent.id = hits.parent_region_id
)
SELECT
    id,
    name,
    region_type,
    parent_region_id,
    area_square_meters
FROM (
    SELECT DISTINCT ON (id)
        id,
        name,
        region_type,
        parent_region_id,
        area_square_meters
    FROM hits
    ORDER BY id
) resolved
ORDER BY area_square_meters ASC
`

const countRegionsSQL = `SELECT COUNT(*) FROM regions`

const insertRegionSQL = `
INSERT INTO regions (name, region_type, geom)
VALUES (
    $1,
    $2,
    ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326))
)
RETURNING id
`

const linkParentSQL = `
UPDATE regions AS child
SET parent_region_id = parent.id
FROM regions AS parent
WHERE child.id = $1
  AND parent.id = $2
`

// PostGISIndex queries the regions table.
type PostGISIndex struct {
	db *sql.DB
}

func NewPostGISIndex(db *sql.DB) *PostGISIndex {
	return &PostGISIndex{db: db}
}

// EnsureSchema creates the regions table, the GiST index, and loads the
// embedded polygons when the table is empty.
func EnsureSchema(ctx context.Context, db *sql.DB) error {
	if _, err := db.ExecContext(ctx, schemaSQL); err != nil {
		return err
	}
	return seedIfEmpty(ctx, db)
}

func seedIfEmpty(ctx context.Context, db *sql.DB) error {
	var count int
	if err := db.QueryRowContext(ctx, countRegionsSQL).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	seed, err := LoadSeed()
	if err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	idBySeedID := make(map[int]int, len(seed))
	for _, region := range seed {
		payload, err := geoJSONGeometry(region.Geom)
		if err != nil {
			return err
		}
		var id int
		if err := tx.QueryRowContext(ctx, insertRegionSQL, region.Name, region.RegionType, payload).Scan(&id); err != nil {
			return fmt.Errorf("insert region %q: %w", region.Name, err)
		}
		idBySeedID[region.ID] = id
	}
	for _, region := range seed {
		if region.ParentRegionID == 0 {
			continue
		}
		childID := idBySeedID[region.ID]
		parentID := idBySeedID[region.ParentRegionID]
		if _, err := tx.ExecContext(ctx, linkParentSQL, childID, parentID); err != nil {
			return fmt.Errorf("link parent for %q: %w", region.Name, err)
		}
	}
	return tx.Commit()
}

func geoJSONGeometry(geom MultiPolygon) (string, error) {
	body, err := json.Marshal(struct {
		Type        string       `json:"type"`
		Coordinates MultiPolygon `json:"coordinates"`
	}{Type: "MultiPolygon", Coordinates: geom})
	if err != nil {
		return "", err
	}
	return string(body), nil
}

// Lookup runs ST_Contains, and ST_DWithin when toleranceMeters is positive.
func (p *PostGISIndex) Lookup(ctx context.Context, longitude, latitude, toleranceMeters float64) ([]Hit, error) {
	rows, err := p.db.QueryContext(ctx, lookupSQL, longitude, latitude, toleranceMeters)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	hits := make([]Hit, 0)
	for rows.Next() {
		var hit Hit
		var parent sql.NullInt64
		if err := rows.Scan(&hit.ID, &hit.Name, &hit.RegionType, &parent, &hit.AreaSquareMeters); err != nil {
			return nil, err
		}
		if parent.Valid {
			value := int(parent.Int64)
			hit.ParentRegionID = &value
		}
		hits = append(hits, hit)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return hits, nil
}
