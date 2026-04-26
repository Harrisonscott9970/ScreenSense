"""
External API Services
- Open-Meteo: free weather API (no key required)
- Google Maps Places API: nearby place search (requires GOOGLE_MAPS_KEY)
- OpenStreetMap Overpass: free fallback when no Google key
"""
import math
import httpx
from typing import Optional, List, Dict
from app.config import settings


async def get_weather(lat: float, lon: float) -> Dict:
    """
    Fetches current weather from Open-Meteo (completely free, no API key).
    Returns condition string + temperature in Celsius.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,weather_code,wind_speed_10m",
        "timezone": "auto"
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get(settings.open_meteo_url, params=params)
            r.raise_for_status()
            data = r.json()
            current = data.get("current", {})
            code = current.get("weather_code", 0)
            temp = current.get("temperature_2m", 15.0)
            return {
                "temp_c": round(temp, 1),
                "condition": _wmo_to_condition(code),
                "wind_kmh": current.get("wind_speed_10m", 0)
            }
    except Exception:
        return {"temp_c": 15.0, "condition": "Unknown", "wind_kmh": 0}


def _wmo_to_condition(code: int) -> str:
    """WMO weather codes → human-readable string."""
    if code == 0: return "Clear sky"
    if code in (1, 2, 3): return "Partly cloudy"
    if code in (45, 48): return "Foggy"
    if code in (51, 53, 55): return "Drizzle"
    if code in (61, 63, 65): return "Rainy"
    if code in (71, 73, 75): return "Snowy"
    if code in (80, 81, 82): return "Rain showers"
    if code in (95, 96, 99): return "Thunderstorm"
    return "Overcast"


async def get_places(
    lat: float,
    lon: float,
    categories: List[str],
    limit: int = 5
) -> List[Dict]:
    """
    Searches for nearby places using:
    1. Google Maps Places API (if GOOGLE_MAPS_KEY configured) — best quality
    2. OpenStreetMap Overpass API (free fallback, no key required)
    3. Generic local defaults (final fallback)
    """
    if settings.google_maps_key:
        result = await _google_places_nearby(lat, lon, categories, limit)
        if result:
            return result

    # Overpass OSM — always available, returns real nearby places
    result = await _overpass_nearby(lat, lon, categories, radius=2500)
    if result:
        return result

    return _local_defaults(categories)


# Google Places type mapping — friendly category → Google type string
_GOOGLE_TYPES: Dict[str, str] = {
    "park":           "park",
    "garden":         "park",
    "green space":    "park",
    "nature reserve": "park",
    "riverside walk": "park",
    "café":           "cafe",
    "quiet café":     "cafe",
    "coffee":         "cafe",
    "library":        "library",
    "museum":         "museum",
    "gallery":        "art_gallery",
    "bookshop":       "book_store",
    "cinema":         "movie_theater",
    "restaurant":     "restaurant",
    "market":         "shopping_mall",
    "social space":   "community_center",
}

# Google type → friendly display name
_GOOGLE_TYPE_LABELS: Dict[str, str] = {
    "park": "Park", "library": "Library", "museum": "Museum",
    "art_gallery": "Gallery", "cafe": "Café", "book_store": "Bookshop",
    "movie_theater": "Cinema", "restaurant": "Restaurant",
    "shopping_mall": "Market", "community_center": "Social Space",
}


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> int:
    """Straight-line distance in metres between two GPS points."""
    R = 6_371_000
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return int(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


async def _google_places_nearby(
    lat: float, lon: float, categories: List[str], limit: int = 5
) -> List[Dict]:
    """
    Google Maps Places API — Nearby Search.
    Queries the top-priority category, returns up to `limit` results.
    Falls back to secondary category if the first returns nothing.
    """
    seen_names: set = set()
    results: List[Dict] = []

    for cat in categories[:3]:
        google_type = _GOOGLE_TYPES.get(cat.lower())
        if not google_type:
            continue
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                r = await client.get(
                    "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
                    params={
                        "location": f"{lat},{lon}",
                        "radius":   2000,
                        "type":     google_type,
                        "key":      settings.google_maps_key,
                    },
                )
                r.raise_for_status()
                data = r.json()

            for place in data.get("results", []):
                name = place.get("name", "").strip()
                if not name or name in seen_names:
                    continue
                seen_names.add(name)

                loc      = place.get("geometry", {}).get("location", {})
                dist     = _haversine_m(lat, lon, loc.get("lat", lat), loc.get("lng", lon))
                vicinity = place.get("vicinity", "Nearby")

                # Pick the most descriptive type label
                raw_types = place.get("types", [])
                display_type = _GOOGLE_TYPE_LABELS.get(google_type, cat.title())
                for t in raw_types:
                    if t in _GOOGLE_TYPE_LABELS:
                        display_type = _GOOGLE_TYPE_LABELS[t]
                        break

                results.append({
                    "name":       name,
                    "type":       display_type,
                    "address":    vicinity,
                    "distance_m": dist,
                    "icon":       _category_icon(display_type),
                    "rating":     place.get("rating"),
                })
                if len(results) >= limit:
                    break

        except Exception:
            continue

        if len(results) >= limit:
            break

    # Sort by distance so the closest come first
    results.sort(key=lambda p: p.get("distance_m") or 9999)
    return results[:limit]


# OSM tag mappings for each friendly category name
_OSM_TAGS: Dict[str, List[tuple]] = {
    "park":           [("leisure", "park")],
    "garden":         [("leisure", "garden")],
    "green space":    [("leisure", "park")],
    "nature reserve": [("leisure", "nature_reserve")],
    "riverside walk": [("leisure", "park")],
    "café":           [("amenity", "cafe")],
    "quiet café":     [("amenity", "cafe")],
    "coffee":         [("amenity", "cafe")],
    "library":        [("amenity", "library")],
    "museum":         [("tourism", "museum")],
    "gallery":        [("tourism", "gallery"), ("tourism", "artwork")],
    "bookshop":       [("shop", "books")],
    "cinema":         [("amenity", "cinema")],
    "restaurant":     [("amenity", "restaurant")],
    "market":         [("amenity", "marketplace"), ("shop", "market")],
    "social space":   [("amenity", "community_centre"), ("amenity", "social_facility")],
}

_OSM_TYPE_MAP: Dict[str, str] = {
    "park": "Park", "garden": "Garden", "nature_reserve": "Nature Reserve",
    "cafe": "Café", "library": "Library", "museum": "Museum",
    "gallery": "Gallery", "artwork": "Gallery", "books": "Bookshop",
    "cinema": "Cinema", "restaurant": "Restaurant",
    "marketplace": "Market", "market": "Market",
    "community_centre": "Social Space", "social_facility": "Social Space",
}


async def _overpass_nearby(lat: float, lon: float, categories: List[str], radius: int = 2500) -> List[Dict]:
    """OpenStreetMap Overpass API — completely free, no key required."""
    tag_clauses: List[str] = []
    seen_tags: set = set()
    for cat in categories[:3]:
        for key, val in _OSM_TAGS.get(cat.lower(), []):
            tag = f"{key}={val}"
            if tag not in seen_tags:
                seen_tags.add(tag)
                tag_clauses.append(f'node["{key}"="{val}"](around:{radius},{lat},{lon});')
                tag_clauses.append(f'way["{key}"="{val}"](around:{radius},{lat},{lon});')

    if not tag_clauses:
        return []

    overpass_query = f"[out:json][timeout:8];({' '.join(tag_clauses)});out center 8;"

    try:
        async with httpx.AsyncClient(timeout=9.0) as client:
            r = await client.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": overpass_query},
                headers={"User-Agent": "ScreenSense-Dissertation/1.0"},
            )
            r.raise_for_status()
            elements = r.json().get("elements", [])

        results: List[Dict] = []
        seen_names: set = set()
        for el in elements:
            tags = el.get("tags", {})
            name = tags.get("name", "").strip()
            if not name or name in seen_names:
                continue
            seen_names.add(name)

            raw_type = (
                tags.get("amenity") or tags.get("leisure") or
                tags.get("tourism") or tags.get("shop") or ""
            )
            cat_type = _OSM_TYPE_MAP.get(raw_type, raw_type.replace("_", " ").title() or "Place")
            street   = tags.get("addr:street", "")
            city     = tags.get("addr:city", "") or tags.get("addr:town", "")
            address  = f"{street}, {city}".strip(", ") or "Nearby"

            results.append({
                "name":       name,
                "type":       cat_type,
                "address":    address,
                "distance_m": None,
                "icon":       _category_icon(cat_type),
            })
            if len(results) >= 5:
                break

        return results
    except Exception:
        return []


def _category_icon(category: str) -> str:
    icons = {
        "Park": "🌿", "Garden": "🌸", "Green Space": "🍃",
        "Library": "📚", "Café": "☕", "Museum": "🏛",
        "Gallery": "🖼", "Market": "🛍", "Restaurant": "🍽",
        "Bookshop": "📖", "Cinema": "🎬", "Nature Reserve": "🌲",
        "Riverside Walk": "🌊", "Social Space": "🤝"
    }
    for k, v in icons.items():
        if k.lower() in category.lower():
            return v
    return "📍"


def _local_defaults(categories: List[str]) -> List[Dict]:
    """Generic nearby-place suggestions when both Foursquare and Overpass fail."""
    BUCKETS: List[tuple] = [
        (["park", "garden", "green space", "nature", "riverside"],
         [{"name": "Nearest park or green space", "type": "Park", "address": "Search on Google Maps", "distance_m": None, "icon": "🌿"},
          {"name": "Nearest nature reserve", "type": "Nature Reserve", "address": "Search on Google Maps", "distance_m": None, "icon": "🌲"}]),
        (["café", "coffee", "bookshop", "book"],
         [{"name": "Nearest independent café", "type": "Café", "address": "Search on Google Maps", "distance_m": None, "icon": "☕"},
          {"name": "Nearest bookshop", "type": "Bookshop", "address": "Search on Google Maps", "distance_m": None, "icon": "📖"}]),
        (["library", "museum", "gallery", "quiet"],
         [{"name": "Nearest public library", "type": "Library", "address": "Search on Google Maps", "distance_m": None, "icon": "📚"},
          {"name": "Nearest museum or gallery", "type": "Museum", "address": "Search on Google Maps", "distance_m": None, "icon": "🏛"}]),
        (["market", "restaurant", "social", "food"],
         [{"name": "Nearest food market", "type": "Market", "address": "Search on Google Maps", "distance_m": None, "icon": "🛍"},
          {"name": "Nearest restaurant", "type": "Restaurant", "address": "Search on Google Maps", "distance_m": None, "icon": "🍽"}]),
    ]
    results: List[Dict] = []
    seen: set = set()
    for cat in (categories or []):
        cat_lower = cat.lower()
        for keywords, places in BUCKETS:
            if any(kw in cat_lower for kw in keywords):
                for p in places:
                    if p["name"] not in seen:
                        results.append(p)
                        seen.add(p["name"])
                break
    if not results:
        results = [
            {"name": "Nearest park", "type": "Park", "address": "Search on Google Maps", "distance_m": None, "icon": "🌿"},
            {"name": "Nearest café", "type": "Café", "address": "Search on Google Maps", "distance_m": None, "icon": "☕"},
        ]
    return results[:4]


async def reverse_geocode(lat: float, lon: float) -> str:
    """Simple reverse geocoding using Open-Meteo's free endpoint."""
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(
                "https://nominatim.openstreetmap.org/reverse",
                params={"lat": lat, "lon": lon, "format": "json"},
                headers={"User-Agent": "ScreenSense-Dissertation/1.0"}
            )
            data = r.json()
            addr = data.get("address", {})
            return (
                addr.get("suburb") or
                addr.get("neighbourhood") or
                addr.get("city_district") or
                addr.get("city") or
                "Your area"
            )
    except Exception:
        return "Your area"
