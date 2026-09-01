// Builds fixtures/geoCities.json with 100 cities + 100 small towns.
//
// Reference coordinates are NOT hand-typed, and are NOT taken from either API
// under test. They come from OpenStreetMap's Nominatim geocoder - an
// independent, authoritative source - so the accuracy assertions are grounded
// in ground truth rather than the fuzzy output of the API we're validating.
//
// Nominatim usage policy: <=1 request/second, descriptive User-Agent. We honor
// both. Edge cases are preserved as-is. Run with:  node utils/generateGeoCities.js
//
// Any name Nominatim cannot resolve to the expected country is reported and
// dropped (so we never assert against a bad reference).

const { request } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(process.cwd(), 'fixtures', 'geoCities.json');
const EDGE_CASES = require('./geoEdgeCases.json');
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'shubhastro-qa-geo-test/1.0 (QA response-time suite)';
const RATE_LIMIT_MS = 1100; // stay under Nominatim's 1 req/sec policy

// 100 well-known Indian cities (major + mid-size). Country IN unless noted.
const CITY_NAMES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Kolkata', 'Chennai', 'Hyderabad', 'Pune', 'Ahmedabad',
  'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Bhopal', 'Patna', 'Vadodara',
  'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Varanasi',
  'Srinagar', 'Aurangabad', 'Dhanbad', 'Amritsar', 'Allahabad', 'Ranchi', 'Howrah', 'Coimbatore',
  'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota', 'Guwahati',
  'Chandigarh', 'Thiruvananthapuram', 'Solapur', 'Hubli', 'Mysore', 'Tiruchirappalli', 'Bareilly', 'Aligarh',
  'Moradabad', 'Bhubaneswar', 'Salem', 'Warangal', 'Guntur', 'Bhiwandi', 'Saharanpur', 'Gorakhpur',
  'Bikaner', 'Amravati', 'Noida', 'Jamshedpur', 'Bhilai', 'Cuttack', 'Firozabad', 'Kochi',
  'Nellore', 'Bhavnagar', 'Dehradun', 'Durgapur', 'Asansol', 'Rourkela', 'Nanded', 'Kolhapur',
  'Ajmer', 'Akola', 'Gulbarga', 'Jamnagar', 'Ujjain', 'Loni', 'Siliguri', 'Jhansi',
  'Ulhasnagar', 'Jammu', 'Sangli', 'Mangalore', 'Erode', 'Belgaum', 'Ambattur', 'Tirunelveli',
  'Malegaon', 'Gaya', 'Udaipur', 'Maheshtala', 'Davanagere', 'Kozhikode', 'Kurnool', 'Rajahmundry',
  'Bokaro', 'South Dumdum', 'Bellary', 'Patiala',
];

// 100 smaller / less-common Indian towns to stress coverage.
const TOWN_NAMES = [
  'Kolar', 'Bhuj', 'Gangtok', 'Port Blair', 'Leh', 'Pathankot', 'Hazaribagh', 'Baripada',
  'Chittoor', 'Hindupur', 'Mandya', 'Karur', 'Dindigul', 'Nagercoil', 'Palakkad', 'Alappuzha',
  'Kollam', 'Kottayam', 'Kannur', 'Thrissur', 'Bardhaman', 'Kharagpur', 'Haldia', 'Krishnanagar',
  'Raiganj', 'Balurghat', 'Jalpaiguri', 'Cooch Behar', 'Purulia', 'Bankura', 'Midnapore', 'Berhampore',
  'Deoghar', 'Giridih', 'Ramgarh', 'Chaibasa', 'Dumka', 'Phusro', 'Medininagar', 'Chirkunda',
  'Sambalpur', 'Balasore', 'Bhadrak', 'Baleshwar', 'Jharsuguda', 'Jeypore', 'Bhawanipatna', 'Rayagada',
  'Angul', 'Dhenkanal', 'Barbil', 'Kendujhar', 'Nabarangpur', 'Paradip', 'Puri', 'Konark',
  'Bhimavaram', 'Tenali', 'Chilakaluripet', 'Proddatur', 'Adoni', 'Madanapalle', 'Tadepalligudem', 'Eluru',
  'Machilipatnam', 'Srikakulam', 'Vizianagaram', 'Anakapalle', 'Tuni', 'Amalapuram', 'Palasa', 'Bobbili',
  'Sagar', 'Satna', 'Rewa', 'Ratlam', 'Dewas', 'Mandsaur', 'Neemuch', 'Chhindwara',
  'Katni', 'Vidisha', 'Damoh', 'Shivpuri', 'Guna', 'Sehore', 'Betul', 'Hoshangabad',
  'Barpeta', 'Dibrugarh', 'Tinsukia', 'Nagaon', 'Tezpur', 'Jorhat', 'Silchar', 'Dhubri',
  'Goalpara', 'Sivasagar', 'Bongaigaon', 'Karimganj',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Free-text "<name>, <country>" search. This ranks by OSM importance, so it
// returns the well-known city for ambiguous names (e.g. Nanded, Maharashtra)
// rather than a minor same-named locality that the structured `city=` param
// sometimes picks.
async function geocode(ctx, name, countryFull) {
  const q = `${name}, ${countryFull}`;
  const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=1`;
  try {
    const res = await ctx.get(url, { headers: { 'User-Agent': USER_AGENT }, timeout: 20000 });
    if (res.status() !== 200) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    const hit = arr[0];
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    // Confirm the result is in the expected country.
    if (hit.display_name && !hit.display_name.endsWith(countryFull)) return null;
    return { name: hit.name || name, lat, lng, displayName: hit.display_name };
  } catch (_) {
    return null;
  }
}

async function resolveAll(ctx, names, expectedCountry, countryFull, kind) {
  const out = [];
  const missed = [];
  for (const name of names) {
    const m = await geocode(ctx, name, countryFull);
    await sleep(RATE_LIMIT_MS);
    if (!m) { missed.push(name); continue; }
    if (kind === 'city') {
      out.push({ query: name.toLowerCase(), expectedName: m.name, expectedCountry, lat: m.lat, lng: m.lng });
    } else {
      out.push({ query: name.toLowerCase(), expectedCountry });
    }
  }
  return { out, missed };
}

(async () => {
  const ctx = await request.newContext();
  try {
    console.log(`Geocoding ${CITY_NAMES.length} cities and ${TOWN_NAMES.length} towns via OpenStreetMap Nominatim`);
    console.log(`(rate-limited to ~1/sec, so this takes ~${Math.ceil((CITY_NAMES.length + TOWN_NAMES.length) * RATE_LIMIT_MS / 1000)}s)...`);
    const citiesRes = await resolveAll(ctx, CITY_NAMES, 'IN', 'India', 'city');
    const townsRes = await resolveAll(ctx, TOWN_NAMES, 'IN', 'India', 'town');

    const doc = {
      note: 'Reference coordinates from OpenStreetMap Nominatim (independent source of truth). Regenerate with: node utils/generateGeoCities.js',
      knownCities: citiesRes.out,
      smallTowns: townsRes.out,
      edgeCases: EDGE_CASES,
    };
    fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));

    console.log(`\nWrote ${citiesRes.out.length} cities + ${townsRes.out.length} towns + ${EDGE_CASES.length} edge cases to ${OUT}`);
    if (citiesRes.missed.length) console.log('Cities the current API could not resolve (dropped):', citiesRes.missed.join(', '));
    if (townsRes.missed.length) console.log('Towns the current API could not resolve (dropped):', townsRes.missed.join(', '));
  } finally {
    await ctx.dispose();
  }
  process.exit(0);
})();
