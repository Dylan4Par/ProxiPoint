package spatial

import (
	"strings"
	"testing"
)

func TestNearbySQLUsesIndexedGeography(t *testing.T) {
	required := []string{
		"FROM entities",
		"ST_DWithin",
		"ST_Distance",
		"ST_SetSRID",
		"ST_MakePoint($1, $2)",
		"4326",
		"::geography",
		"ORDER BY distance_meters ASC",
	}
	for _, needle := range required {
		if !strings.Contains(nearbyEntitiesSQL, needle) {
			t.Fatalf("query missing %q:\n%s", needle, nearbyEntitiesSQL)
		}
	}
}

func TestSplitSQLDropsBlankStatements(t *testing.T) {
	got := splitSQL("CREATE EXTENSION IF NOT EXISTS postgis;\n\nCREATE TABLE entities (id uuid);\n")
	if len(got) != 2 {
		t.Fatalf("statements: %#v", got)
	}
}
