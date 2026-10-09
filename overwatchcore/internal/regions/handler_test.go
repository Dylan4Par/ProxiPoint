package regions

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakeQuerier struct {
	longitude float64
	latitude  float64
	tolerance float64
	hits      []Hit
	err       error
}

func (f *fakeQuerier) Lookup(_ context.Context, longitude, latitude, toleranceMeters float64) ([]Hit, error) {
	f.longitude = longitude
	f.latitude = latitude
	f.tolerance = toleranceMeters
	if f.err != nil {
		return nil, f.err
	}
	return f.hits, nil
}

func TestLookupHTTPUsesCoordinateAndDefaultBuffer(t *testing.T) {
	parent := 3
	q := &fakeQuerier{hits: []Hit{{
		ID: 4, Name: "Pearl Street Mall", RegionType: "pedestrian_mall", ParentRegionID: &parent,
	}}}
	body := `{"longitude":-105.2785,"latitude":40.0176}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/regions/lookup", strings.NewReader(body))
	rec := httptest.NewRecorder()

	HandleLookup(q).ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	if q.longitude != -105.2785 || q.latitude != 40.0176 || q.tolerance != DefaultToleranceMeters {
		t.Fatalf("lookup args lon %v lat %v tolerance %v", q.longitude, q.latitude, q.tolerance)
	}

	var response lookupResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Regions) != 1 || response.Regions[0].Name != "Pearl Street Mall" {
		t.Fatalf("regions = %#v", response.Regions)
	}
	if response.Regions[0].ParentRegionID == nil || *response.Regions[0].ParentRegionID != 3 {
		t.Fatalf("parent = %#v", response.Regions[0].ParentRegionID)
	}
}

func TestLookupHTTPRejectsBadCoordinates(t *testing.T) {
	q := &fakeQuerier{}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/regions/lookup", strings.NewReader(`{"longitude":-105.2785}`))
	rec := httptest.NewRecorder()
	HandleLookup(q).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", rec.Code)
	}
}

func TestMemoryLookupThroughHTTP(t *testing.T) {
	body := `{"longitude":-105.2785,"latitude":40.0176,"toleranceMeters":15}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/regions/lookup", strings.NewReader(body))
	rec := httptest.NewRecorder()
	HandleLookup(NewMemoryIndex()).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body = %s", rec.Code, rec.Body.String())
	}
	var response lookupResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &response); err != nil {
		t.Fatal(err)
	}
	if len(response.Regions) == 0 || response.Regions[0].Name != "Pearl Street Mall" {
		t.Fatalf("regions = %#v", response.Regions)
	}
}
