// Pricing logic (inlined directly — a separate shared _pricing.js file caused Vercel to
// fail with "Cannot find module" at runtime, so this is duplicated in bookings.js too;
// if you change the pricing formula, update it in both places).

// Fixed routes: base fare + live fuel cost, no per-person surcharge.
const FIXED_ROUTES = {
  gc: { base: 193.50, km: 132.4 },
  bne: { base: 526.68, km: 348 },
};

// Custom route base fare: flat $115 covers the first 40km, then ~$3.00/km beyond that.
// Calibrated so it matches the dedicated Gold Coast ($193.50 base) and Brisbane ($526.68
// base) routes at their real one-way distances (66.4km and 178.1km respectively). Live
// fuel is added on top separately below, same as the fixed routes — this is no longer a
// static fuel-included number, so it stays accurate as fuel prices change.
const CUSTOM_FLAT_FEE = 115;
const CUSTOM_FLAT_RADIUS_KM = 40;
const CUSTOM_PER_KM_RATE = 3.00;

const FALLBACK_FUEL_PRICE = 2.39; // used only if the live lookup fails

// Byron Bay (regional, premium 95/98) runs well above the capital-city regular-unleaded
// figures this API reports. This offset bridges that gap — adjust it anytime in Vercel's
// environment variables (no redeploy needed) as local prices change. Starting estimate:
// ~$2.30/L locally (per PetrolSpy) vs ~$1.60–1.65/L regular unleaded in nearby capitals.
const DEFAULT_FUEL_PRICE_OFFSET = 0.65;

async function getRawFuelPrice() {
  const apiKey = process.env.COLLECTAPI_KEY;
  if (!apiKey) return FALLBACK_FUEL_PRICE;

  try {
    const apiRes = await fetch('https://api.collectapi.com/gasPrice/australiaGasoline', {
      headers: {
        authorization: `apikey ${apiKey}`,
        'content-type': 'application/json',
      },
    });
    const data = await apiRes.json();
    if (data?.success && Array.isArray(data.results)) {
      // Brisbane is used as the reference city for both Gold Coast and Brisbane routes,
      // since they're both in South-East Queensland.
      const brisbane = data.results.find((r) => r.city === 'Brisbane');
      if (brisbane?.gasoline) {
        const parsed = parseFloat(String(brisbane.gasoline).replace('$', ''));
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
  } catch (e) {
    console.warn('Fuel price fetch failed, using fallback rate.', e);
  }
  return FALLBACK_FUEL_PRICE;
}

function getFuelPriceOffset() {
  const raw = process.env.FUEL_PRICE_OFFSET;
  const parsed = raw !== undefined ? parseFloat(raw) : NaN;
  return Number.isNaN(parsed) ? DEFAULT_FUEL_PRICE_OFFSET : parsed;
}

async function getDistanceKm(originAddress, destinationAddress) {
  const apiKey = process.env.GOOGLE_SERVER_MAPS_KEY;
  if (!apiKey || !originAddress || !destinationAddress) return null;

  // Always query in a fixed alphabetical order, regardless of actual pickup/drop-off
  // direction, so A→B and B→A always return the identical distance (and therefore
  // identical price) — Google's routing can otherwise differ slightly by direction
  // (one-way streets, highway ramps, etc.).
  const [pointA, pointB] = [originAddress, destinationAddress].sort();

  try {
    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', pointA);
    url.searchParams.set('destinations', pointB);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    const data = await res.json();
    const element = data?.rows?.[0]?.elements?.[0];
    if (data?.status === 'OK' && element?.status === 'OK' && element.distance?.value != null) {
      return element.distance.value / 1000; // metres -> km
    }
    console.warn('Distance Matrix returned no usable result:', JSON.stringify(data));
  } catch (e) {
    console.warn('Distance Matrix request failed:', e);
  }
  return null;
}

// Computes price for a given booking (or partial booking, for a live estimate).
// booking needs: routeId, and for 'custom': fromCustomAddress + toAddress (optional —
// falls back to the flat 40km rate if not provided), and optionally returnEnabled.
async function calcPrice(booking) {
  let oneWay;
  let fuelInfo = null;
  let distanceInfo = null;

  if (booking.routeId === 'custom') {
    const distanceKm = await getDistanceKm(booking.fromCustomAddress, booking.toAddress);
    // If the distance lookup fails (missing key, bad/incomplete address, API error), fall
    // back to assuming the trip is within the flat 40km radius rather than guessing high.
    const usedDistanceKm = distanceKm ?? CUSTOM_FLAT_RADIUS_KM;
    const extraKm = Math.max(0, usedDistanceKm - CUSTOM_FLAT_RADIUS_KM);
    const base = CUSTOM_FLAT_FEE + extraKm * CUSTOM_PER_KM_RATE;

    const rawFuelPrice = await getRawFuelPrice();
    const offset = getFuelPriceOffset();
    const adjustedFuelPrice = rawFuelPrice + offset;
    // Fixed routes' "km" figures are round-trip distances (per the business's own cost
    // sheet), so double the one-way distance here to use the identical fuel formula
    // consistently across both custom and fixed routes.
    const roundTripKm = usedDistanceKm * 2;
    const fuelCost = (roundTripKm / 100) * 10 * adjustedFuelPrice;
    oneWay = base + fuelCost;

    fuelInfo = {
      rawFuelPrice: Math.round(rawFuelPrice * 100) / 100,
      offset,
      adjustedFuelPrice: Math.round(adjustedFuelPrice * 100) / 100,
    };
    distanceInfo = {
      distanceKm: Math.round(usedDistanceKm * 10) / 10,
      wasCalculated: distanceKm !== null,
    };
  } else {
    const route = FIXED_ROUTES[booking.routeId] || FIXED_ROUTES.gc;
    const rawFuelPrice = await getRawFuelPrice();
    const offset = getFuelPriceOffset();
    const adjustedFuelPrice = rawFuelPrice + offset;
    const fuelCost = (route.km / 100) * 10 * adjustedFuelPrice;
    oneWay = route.base + fuelCost;
    fuelInfo = {
      rawFuelPrice: Math.round(rawFuelPrice * 100) / 100,
      offset,
      adjustedFuelPrice: Math.round(adjustedFuelPrice * 100) / 100,
    };
  }

  const total = booking.returnEnabled ? oneWay * 2 : oneWay;
  return {
    price: Math.round(total * 100) / 100,
    fuelInfo, // null for custom route — no live fuel component in that formula
    distanceInfo, // null for fixed routes — only set for custom route
  };
}


module.exports = async function handler(req, res) {
  // Same cross-origin situation as bookings.js — the front end calls this from inside
  // Framer's embedded iframe.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { routeId, fromCustomAddress, toAddress, returnEnabled } = req.query;

  if (!routeId) {
    return res.status(400).json({ error: 'Missing routeId' });
  }

  try {
    const result = await calcPrice({
      routeId,
      fromCustomAddress,
      toAddress,
      returnEnabled: returnEnabled === 'true',
    });
    return res.status(200).json(result);
  } catch (e) {
    console.error('Estimate calculation failed:', e);
    return res.status(500).json({ error: 'Could not calculate estimate' });
  }
};
