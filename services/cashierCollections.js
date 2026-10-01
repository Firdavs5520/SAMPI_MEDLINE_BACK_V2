// Kassaga haqiqatda tushgan pul to'lov vaqti bo'yicha hisoblanadi: eski qarz bugun
// yopilsa, u bugungi tushumga kiradi. Har bir yozuv uchun "collections" massivi
// yasaladi: debtPayments dagi to'lovlar + debtPayments ga yozilmagan (eski
// yozuvlardagi) to'lov qismi yozuv sanasi bilan.
const buildCollectionStages = (range) => {
  const isInRange = (field) =>
    range ? { $and: [{ $gte: [field, range.start] }, { $lte: [field, range.end] }] } : true;

  return [
    ...(range
      ? [
          {
            $match: {
              $or: [
                { debtPayments: { $elemMatch: { paidAt: { $gte: range.start, $lte: range.end } } } },
                { entryDate: { $gte: range.start, $lte: range.end } }
              ]
            }
          }
        ]
      : []),
    {
      $addFields: {
        unrecordedPaidAmount: {
          $subtract: [
            { $ifNull: ["$paidAmount", 0] },
            { $sum: { $ifNull: ["$debtPayments.amount", []] } }
          ]
        }
      }
    },
    {
      $addFields: {
        collections: {
          $concatArrays: [
            {
              $map: {
                input: {
                  $filter: {
                    input: { $ifNull: ["$debtPayments", []] },
                    as: "payment",
                    cond: isInRange("$$payment.paidAt")
                  }
                },
                as: "payment",
                in: {
                  amount: "$$payment.amount",
                  paymentMethod: "$$payment.paymentMethod",
                  paidAt: "$$payment.paidAt"
                }
              }
            },
            {
              $cond: [
                {
                  $and: [{ $gt: ["$unrecordedPaidAmount", 0.009] }, isInRange("$entryDate")]
                },
                [
                  {
                    amount: "$unrecordedPaidAmount",
                    paymentMethod: "$paymentMethod",
                    paidAt: "$entryDate"
                  }
                ],
                []
              ]
            }
          ]
        }
      }
    },
    { $unwind: "$collections" }
  ];
};

module.exports = { buildCollectionStages };
