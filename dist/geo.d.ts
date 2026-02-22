/** Convert a geotile grid key ("zoom/x/y") to the tile centroid lat/lng. */
export declare function geotileToLatLng(key: string): {
    lat: number;
    lng: number;
};
