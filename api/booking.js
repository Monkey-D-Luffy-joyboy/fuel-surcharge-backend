module.exports = async (req, res) => {
  let fuelPrice = 2.39;

  try {
    const apiRes = await fetch("https://api.collectapi.com/gasPrice/stateUsaPrice?state=QLD");
    const data = await apiRes.json();
    if (data?.result?.gasoline) {
      fuelPrice = parseFloat(data.result.gasoline);
    }
  } catch (err) {
    fuelPrice = 2.39;
  }

  // Brisbane Transfer
  const brisbaneBase = 526.68;
  const brisbaneKm = 348;
  const brisbaneFuelCost = (brisbaneKm / 100) * 10 * fuelPrice;
  const brisbaneTotal = Math.round(brisbaneBase + brisbaneFuelCost);

  // Gold Coast Transfer
  const goldCoastBase = 193.50;
  const goldCoastKm = 132.4;
  const goldCoastFuelCost = (goldCoastKm / 100) * 10 * fuelPrice;
  const goldCoastTotal = Math.round(goldCoastBase + goldCoastFuelCost);

  res.status(200).json({
    goldCoastTransfer: {
      totalPrice: goldCoastTotal,
      stripeUrl: "https://buy.stripe.com/28EaEYfmf5ls8m4dKZ2go01"
    },
    brisbaneTransfer: {
      totalPrice: brisbaneTotal,
      stripeUrl: "https://buy.stripe.com/7sY5kE7TN8xEbyg5et2go02"
    }
  });
};
