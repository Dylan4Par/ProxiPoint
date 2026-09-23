export type MapCoordinate = {
  lat: number;
  lon: number;
};

export type MapTarget = MapCoordinate & {
  id: string;
  name: string;
};
