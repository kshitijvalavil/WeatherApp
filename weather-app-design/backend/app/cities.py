"""The Indian cities the app supports.

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
    {"id": "srinagar",  "name": "Srinagar",  "state": "Jammu & Kashmir", "lat": 34.0837, "lon": 74.7973},
    {"id": "leh",       "name": "Leh",       "state": "Ladakh",        "lat": 34.1526, "lon": 77.5771},
    {"id": "amritsar",  "name": "Amritsar",  "state": "Punjab",        "lat": 31.6340, "lon": 74.8723},
    {"id": "shimla",    "name": "Shimla",    "state": "Himachal Pradesh", "lat": 31.1048, "lon": 77.1734},
    {"id": "chandigarh","name": "Chandigarh","state": "Chandigarh",    "lat": 30.7333, "lon": 76.7794},
    {"id": "dehradun",  "name": "Dehradun",  "state": "Uttarakhand",   "lat": 30.3165, "lon": 78.0322},
    {"id": "jodhpur",   "name": "Jodhpur",   "state": "Rajasthan",     "lat": 26.2389, "lon": 73.0243},
    {"id": "varanasi",  "name": "Varanasi",  "state": "Uttar Pradesh", "lat": 25.3176, "lon": 82.9739},
    {"id": "patna",     "name": "Patna",     "state": "Bihar",         "lat": 25.5941, "lon": 85.1376},
    {"id": "gangtok",   "name": "Gangtok",   "state": "Sikkim",        "lat": 27.3389, "lon": 88.6065},
    {"id": "guwahati",  "name": "Guwahati",  "state": "Assam",         "lat": 26.1445, "lon": 91.7362},
    {"id": "shillong",  "name": "Shillong",  "state": "Meghalaya",     "lat": 25.5788, "lon": 91.8933},
    {"id": "bhopal",    "name": "Bhopal",    "state": "Madhya Pradesh","lat": 23.2599, "lon": 77.4126},
    {"id": "indore",    "name": "Indore",    "state": "Madhya Pradesh","lat": 22.7196, "lon": 75.8577},
    {"id": "nagpur",    "name": "Nagpur",    "state": "Maharashtra",   "lat": 21.1458, "lon": 79.0882},
    {"id": "raipur",    "name": "Raipur",    "state": "Chhattisgarh",  "lat": 21.2514, "lon": 81.6296},
    {"id": "bhubaneswar","name": "Bhubaneswar","state": "Odisha",      "lat": 20.2961, "lon": 85.8245},
    {"id": "visakhapatnam","name": "Visakhapatnam","state": "Andhra Pradesh","lat": 17.6868, "lon": 83.2185},
    {"id": "panaji",    "name": "Goa",       "state": "Goa",           "lat": 15.4909, "lon": 73.8278},
    {"id": "kochi",     "name": "Kochi",     "state": "Kerala",        "lat": 9.9312,  "lon": 76.2673},
    {"id": "thiruvananthapuram","name": "Thiruvananthapuram","state": "Kerala","lat": 8.5241, "lon": 76.9366},
    {"id": "madurai",   "name": "Madurai",   "state": "Tamil Nadu",    "lat": 9.9252,  "lon": 78.1198},
    {"id": "portblair", "name": "Port Blair","state": "Andaman & Nicobar","lat": 11.6234, "lon": 92.7265},
]

BY_ID = {c["id"]: c for c in CITIES}


def find(city_id: str):
    """Return a city dict by id, or None."""
    return BY_ID.get(city_id.lower().strip())
