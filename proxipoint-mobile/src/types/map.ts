export type MapCoordinate = {
  lat: number;
  lon: number;
};

export type MapTarget = MapCoordinate & {
  name: string;
};
