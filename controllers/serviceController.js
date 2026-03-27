const asyncHandler = require("../utils/asyncHandler");
const serviceCatalogService = require("../services/serviceCatalogService");

const toNumber = (value) => (typeof value === "string" ? Number(value) : value);

const getAllServices = asyncHandler(async (req, res) => {
  const services = await serviceCatalogService.getAllServices({ user: req.user });
  res.status(200).json({ success: true, data: services });
});

const getServiceById = asyncHandler(async (req, res) => {
  const service = await serviceCatalogService.getServiceById(req.params.id);
  res.status(200).json({ success: true, data: service });
});

const createService = asyncHandler(async (req, res) => {
  const service = await serviceCatalogService.createService({
    name: req.body.name,
    type: req.body.type,
    price: toNumber(req.body.price),
    user: req.user
  });
  res.status(201).json({ success: true, data: service });
});

const updateService = asyncHandler(async (req, res) => {
  const service = await serviceCatalogService.updateService({
    serviceId: req.params.id,
    name: req.body.name,
    price: toNumber(req.body.price),
    user: req.user
  });
  res.status(200).json({ success: true, data: service });
});

const deleteService = asyncHandler(async (req, res) => {
  const result = await serviceCatalogService.deleteService({
    serviceId: req.params.id,
    user: req.user
  });
  res.status(200).json({ success: true, data: result });
});

module.exports = {
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService
};
