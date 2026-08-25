module.exports = async (req, res) => {
  let fuelPrice = 2.39; // Default rate per liter

  try {
    const apiRes = await fetch("https://api.collectapi.com/gasPrice/stateUsaPrice?state=QLD");
    const data = await apiRes.json();
    if (data?.result?.gasoline) {
      fuelPrice = parseFloat(data.result.gasoline);
    }
  } catch (err) {
    fuelPrice = 2.39;
  }

  // Brisbane Transfer (348 km, Base: $526.68)
  const brisbaneBase = 526.68;
  const brisbaneKm = 348;
  const brisbaneFuelCost = (brisbaneKm / 100) * 10 * fuelPrice;
  const brisbaneTotal = Math.round(brisbaneBase + brisbaneFuelCost);

  // Gold Coast Transfer (132.4 km, Base: $193.50)
  const goldCoastBase = 193.50;
  const goldCoastKm = 132.4;
  const goldCoastFuelCost = (goldCoastKm / 100) * 10 * fuelPrice;
  const goldCoastTotal = Math.round(goldCoastBase + goldCoastFuelCost);

  res.status(200).json({
    goldCoastTransfer: {
      totalPrice: goldCoastTotal,
      stripeUrl: "https://buy.stripe.com/YOUR_REAL_GOLD_COAST_STRIPE_LINK"
    },
    brisbaneTransfer: {
      totalPrice: brisbaneTotal,
      stripeUrl: "https://buy.stripe.com/YOUR_REAL_BRISBANE_STRIPE_LINK"
    }
  });
};
