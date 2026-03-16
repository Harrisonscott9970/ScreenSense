"""
External API Services
- Open-Meteo: free weather API (no key required)
- Foursquare Places: free tier venue search
"""
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
    Searches Foursquare for nearby places matching given categories.
    Free tier: 1000 API calls/day, no credit card needed.
    Sign up at: https://foursquare.com/developers/
    Add FOURSQUARE_API_KEY to your .env file.

    Falls back to curated London defaults if no key is configured.
    """
    if not settings.foursquare_api_key:
        return _london_defaults(categories)

    query = " OR ".join(categories[:2])
    headers = {
        "Authorization": settings.foursquare_api_key,
        "Accept": "application/json"
    }
    params = {
        "ll": f"{lat},{lon}",
        "query": query,
        "limit": limit,
        "radius": 3000  # 3km
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            r = await client.get(settings.foursquare_url, headers=headers, params=params)
            r.raise_for_status()
            results = r.json().get("results", [])
            return [
                {
                    "name": p.get("name", "Unknown"),
                    "type": p.get("categories", [{}])[0].get("name", "Place") if p.get("categories") else "Place",
                    "address": p.get("location", {}).get("formatted_address", ""),
                    "distance_m": p.get("distance", 0),
                    "foursquare_id": p.get("fsq_id", ""),
                    "icon": _category_icon(categories[0] if categories else "")
                }
                for p in results
            ]
    except Exception:
        return _london_defaults(categories)


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


def _london_defaults(categories: List[str]) -> List[Dict]:
    """Curated London fallback places when Foursquare key isn't set."""
    defaults = {
        "Park": [
            {"name": "Regent's Park", "type": "Park", "address": "Regent's Park, London NW1", "distance_m": 800, "icon": "🌿"},
            {"name": "Victoria Embankment Gardens", "type": "Park", "address": "Embankment, London WC2N", "distance_m": 1200, "icon": "🌿"},
        ],
        "Café": [
            {"name": "A nearby independent café", "type": "Café", "address": "Your local area", "distance_m": 300, "icon": "☕"},
        ],
        "Library": [
            {"name": "British Library", "type": "Library", "address": "96 Euston Rd, London NW1 2DB", "distance_m": 1500, "icon": "📚"},
        ],
        "Gallery": [
            {"name": "Tate Modern", "type": "Gallery", "address": "Bankside, London SE1 9TG", "distance_m": 2000, "icon": "🖼"},
        ],
        "Museum": [
            {"name": "Natural History Museum", "type": "Museum", "address": "Cromwell Rd, London SW7 5BD", "distance_m": 2500, "icon": "🏛"},
        ],
    }
    results = []
    for cat in categories:
        for k, v in defaults.items():
            if k.lower() in cat.lower():
                results.extend(v)
                break
    return results[:4] if results else [
        {"name": "Your nearest green space", "type": "Park", "address": "Check Google Maps", "distance_m": 500, "icon": "🌿"}
    ]


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
