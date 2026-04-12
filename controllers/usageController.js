const asyncHandler = require("../utils/asyncHandler");
const usageService = require("../services/usageService");

const toNumber = (value) => (typeof value === "string" ? Number(value) : value);

const useMedicine = asyncHandler(async (req, res) => {
  const result = await usageService.useMedicine({
    medicineId: req.body.medicineId,
    quantity: toNumber(req.body.quantity),
    user: req.user
  });

  res.status(201).json({
    success: true,
    data: result
  });
});

const useService = asyncHandler(async (req, res) => {
  const result = await usageService.useService({
    serviceId: req.body.serviceId,
    quantity: toNumber(req.body.quantity),
    priceTier: req.body.priceTier,
    patient: req.body.patient,
    lorIdentity: req.body.lorIdentity,
    user: req.user
  });

  res.status(201).json({
    success: true,
    data: result
  });
});

const getMyChecks = asyncHandler(async (req, res) => {
  const checks = await usageService.getMyChecks({
    user: req.user,
    search: req.query.q,
    lorIdentity: req.query.lorIdentity
  });

  res.status(200).json({
    success: true,
    data: checks
  });
});

const createCheckout = asyncHandler(async (req, res) => {
  const medicines = Array.isArray(req.body.medicines)
    ? req.body.medicines.map((item) => ({
        medicineId: item.medicineId,
        quantity: toNumber(item.quantity)
      }))
    : [];

  const services = Array.isArray(req.body.services)
    ? req.body.services.map((item) => ({
        serviceId: item.serviceId,
        quantity: toNumber(item.quantity),
        priceTier: item.priceTier
      }))
    : [];

  const result = await usageService.createNurseCheckout({
    medicines,
    services,
    patient: req.body.patient,
    specialistId: req.body.specialistId,
    specialistName: req.body.specialistName,
    user: req.user
  });

  res.status(201).json({
    success: true,
    data: result
  });
});

const createLorCheckout = asyncHandler(async (req, res) => {
  const services = Array.isArray(req.body.services)
    ? req.body.services.map((item) => ({
        serviceId: item.serviceId,
        quantity: toNumber(item.quantity),
        priceTier: item.priceTier
      }))
    : [];

  const result = await usageService.createLorCheckout({
    services,
    patient: req.body.patient,
    lorIdentity: req.body.lorIdentity,
    specialistId: req.body.specialistId,
    specialistName: req.body.specialistName,
    user: req.user
  });

  res.status(201).json({
    success: true,
    data: result
  });
});

const getRoleSpecialists = asyncHandler(async (req, res) => {
  const data = await usageService.getRoleSpecialists({
    user: req.user,
    search: req.query.search
  });

  res.status(200).json({
    success: true,
    data
  });
});

const createRoleSpecialist = asyncHandler(async (req, res) => {
  const data = await usageService.createRoleSpecialist({
    name: req.body.name,
    user: req.user
  });

  res.status(201).json({
    success: true,
    data
  });
});

module.exports = {
  useMedicine,
  useService,
  createCheckout,
  createLorCheckout,
  getMyChecks,
  getRoleSpecialists,
  createRoleSpecialist
};
