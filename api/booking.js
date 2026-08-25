module.exports = async (req, res) => {
  const fuelPricePerLiter = 1.85; 
  const fuelSurcharge = Math.round((fuelPricePerLiter - 1.50) * 20);

  const basePrices = {
    goldCoast: 210,
    brisbane: 600
  };

  res.status(200).json({
    goldCoastTransfer: {
      totalPrice: basePrices.goldCoast + fuelSurcharge,
      stripeUrl: "https://buy.stripe.com/YOUR_GOLD_COAST_STRIPE_LINK"
    },
    brisbaneTransfer: {
      totalPrice: basePrices.brisbane + fuelSurcharge,
      stripeUrl: "https://buy.stripe.com/YOUR_BRISBANE_STRIPE_LINK"
    }
  });
};
