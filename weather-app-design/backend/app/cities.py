"""The ten Indian cities the first version supports.

Each city has:
- a short id used in URLs (e.g. "mumbai")
- a display name and state
- latitude and longitude (for MET Norway, kept to 4 decimal places)
- an IMD station id if we know one (used later when IMD access is granted)
"""

CITIES = [
    {"id": "delhi",     "name": "Delhi",     "state": "NCT",           "lat": 28.6139, "lon": 77.2090, "imd_id": "42182"},
    {"id": "mumbai",    "name": "Mumbai",    "state": "Maharashtra",   "lat": 19.0760, "lon": 72.8777, "imd_id": "43003"},
    {"id": "kolkata",   "name": "Kolkata",   "state": "West Bengal",   "lat": 22.5726, "lon": 88.3639, "imd_id": "42809"},
    {"id": "chennai",   "name": "Chennai",   "state": "Tamil Nadu",    "lat": 13.0827, "lon": 80.2707, "imd_id": "43279"},
    {"id": "bengaluru", "name": "Bengaluru", "state": "Karnataka",     "lat": 12.9716, "lon": 77.5946, "imd_id": "43295"},
    {"id": "hyderabad", "name": "Hyderabad", "state": "Telangana",     "lat": 17.3850, "lon": 78.4867, "imd_id": "43128"},
    {"id": "jaipur",    "name": "Jaipur",    "state": "Rajasthan",     "lat": 26.9124, "lon": 75.7873, "imd_id": "42348"},
    {"id": "ahmedabad", "name": "Ahmedabad", "state": "Gujarat",       "lat": 23.0225, "lon": 72.5714, "imd_id": "42647"},
    {"id": "pune",      "name": "Pune",      "state": "Maharashtra",   "lat": 18.5204, "lon": 73.8567, "imd_id": "43063"},
    {"id": "lucknow",   "name": "Lucknow",   "state": "Uttar Pradesh", "lat": 26.8467, "lon": 80.9462, "imd_id": "42369"},
]

BY_ID = {c["id"]: c for c in CITIES}


def find(city_id: str):
    """Return a city dict by id, or None."""
    return BY_ID.get(city_id.lower().strip())
