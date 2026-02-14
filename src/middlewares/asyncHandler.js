const asyncHandler = (controllerFn) => (req, res, next) =>
  Promise.resolve(controllerFn(req, res, next)).catch(next);

module.exports = asyncHandler;
